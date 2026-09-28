;; StackPay Architecture
;; Compact MVP surface for:
;; - merchant-created invoices
;; - public multipay / universal QR links
;; - processor-gated payment settlement
;; - read-only invoice and link views

(define-trait invoice-trait (
  (get-invoice
    ((string-ascii 85))
    (
      response
      (optional {
        merchant: principal,
        recipient: principal,
        amount: uint,
        currency: (string-ascii 10),
        status: uint,
        created-at: uint,
        expires-at: uint,
        paid-at: (optional uint),
        description: (string-utf8 256),
      })
      uint
    )
  )
))

(define-constant ERR_UNAUTHORIZED (err u100))
(define-constant ERR_INVOICE_NOT_FOUND (err u101))
(define-constant ERR_INVALID_STATUS (err u102))
(define-constant ERR_INVOICE_ALREADY_PAID (err u103))
(define-constant ERR_INSUFFICIENT_PAYMENT (err u104))
(define-constant ERR_INVALID_AMOUNT (err u105))
(define-constant ERR_INVALID_INPUT (err u107))
(define-constant ERR_INVALID_PRINCIPAL (err u109))
(define-constant ERR_LINK_NOT_FOUND (err u111))

(define-constant STATUS_PENDING u0)
(define-constant STATUS_PAID u1)
(define-constant STATUS_EXPIRED u2)

(define-constant CURRENCY_STX "STX")
(define-constant CURRENCY_SBTC "sBTC")
(define-constant CURRENCY_USDC "USDCx")

(define-constant LINK_KIND_MULTIPAY u1)
(define-constant LINK_KIND_UNIVERSAL u2)

(define-data-var owner principal tx-sender)
(define-data-var processor (optional principal) none)
(define-data-var invoice-ctr uint u0)
(define-data-var receipt-ctr uint u0)
(define-data-var payment-link-ctr uint u0)
(define-data-var invoice-total uint u0)
(define-data-var receipt-total uint u0)
(define-data-var payment-link-total uint u0)

(define-map invoices
  { invoice-id: (string-ascii 85) }
  {
    merchant: principal,
    recipient: principal,
    amount: uint,
    currency: (string-ascii 10),
    status: uint,
    created-at: uint,
    expires-at: uint,
    paid-at: (optional uint),
    description: (string-utf8 256),
  }
)

(define-map receipts
  { receipt-id: (string-ascii 85) }
  {
    invoice-id: (string-ascii 85),
    payer: principal,
    amount-paid: uint,
    timestamp: uint,
  }
)

(define-map payment-links
  { link-id: (string-ascii 85) }
  {
    merchant: principal,
    recipient: principal,
    slug: (string-ascii 64),
    kind: uint,
    title: (string-utf8 128),
    description: (string-utf8 256),
    default-currency: (optional (string-ascii 10)),
    default-amount: (optional uint),
    suggested-amount-1: (optional uint),
    suggested-amount-2: (optional uint),
    suggested-amount-3: (optional uint),
    amount-step: (optional uint),
    allow-custom-amount: bool,
    accepts-stx: bool,
    accepts-sbtc: bool,
    accepts-usdcx: bool,
    is-active: bool,
    created-at: uint,
  }
)

(define-map payment-link-slugs
  { slug: (string-ascii 64) }
  { link-id: (string-ascii 85) }
)

(define-private (current-time)
  stacks-block-time
)

(define-private (authorized-processor-caller)
  (or
    (is-eq contract-caller .proc)
    (match (var-get processor)
      configured-processor (is-eq contract-caller configured-processor)
      false
    )
  )
)

(define-private (any-suggested-amount
    (suggested-amount-1 (optional uint))
    (suggested-amount-2 (optional uint))
    (suggested-amount-3 (optional uint))
  )
  (or
    (is-some suggested-amount-1)
    (or (is-some suggested-amount-2) (is-some suggested-amount-3))
  )
)

(define-private (valid-suggested-amounts
    (suggested-amount-1 (optional uint))
    (suggested-amount-2 (optional uint))
    (suggested-amount-3 (optional uint))
  )
  (and
    (match suggested-amount-1 value (> value u0) true)
    (and
      (match suggested-amount-2 value (> value u0) true)
      (match suggested-amount-3 value (> value u0) true)
    )
  )
)

(define-private (amount-in-suggestions
    (amount uint)
    (suggested-amount-1 (optional uint))
    (suggested-amount-2 (optional uint))
    (suggested-amount-3 (optional uint))
  )
  (or
    (match suggested-amount-1 value (is-eq amount value) false)
    (or
      (match suggested-amount-2 value (is-eq amount value) false)
      (match suggested-amount-3 value (is-eq amount value) false)
    )
  )
)

(define-private (valid-currency (currency (string-ascii 10)))
  (or
    (is-eq currency CURRENCY_STX)
    (or (is-eq currency CURRENCY_SBTC) (is-eq currency CURRENCY_USDC))
  )
)

(define-private (valid-principal (who principal))
  (and
    (not (is-eq who 'SP000000000000000000002Q6VF78))
    (not (is-eq who 'ST000000000000000000002AMW42H))
    true
  )
)

(define-private (currency-enabled
    (currency (string-ascii 10))
    (accepts-stx bool)
    (accepts-sbtc bool)
    (accepts-usdcx bool)
  )
  (if (is-eq currency CURRENCY_STX)
    accepts-stx
    (if (is-eq currency CURRENCY_SBTC)
      accepts-sbtc
      (if (is-eq currency CURRENCY_USDC) accepts-usdcx false)
    )
  )
)

(define-private (effective-status (invoice {
    merchant: principal,
    recipient: principal,
    amount: uint,
    currency: (string-ascii 10),
    status: uint,
    created-at: uint,
    expires-at: uint,
    paid-at: (optional uint),
    description: (string-utf8 256),
  }))
  (if
    (and
      (is-eq (get status invoice) STATUS_PENDING)
      (>= (current-time) (get expires-at invoice))
    )
    STATUS_EXPIRED
    (get status invoice)
  )
)

(define-private (new-invoice-id)
  (let (
      (counter (var-get invoice-ctr))
      (timestamp (current-time))
    )
    (var-set invoice-ctr (+ counter u1))
    (concat
      (concat "INV_" (int-to-ascii timestamp))
      (concat "_" (int-to-ascii counter))
    )
  )
)

(define-private (new-receipt-id)
  (let (
      (counter (var-get receipt-ctr))
      (timestamp (current-time))
    )
    (var-set receipt-ctr (+ counter u1))
    (concat
      (concat "RCP_" (int-to-ascii timestamp))
      (concat "_" (int-to-ascii counter))
    )
  )
)

(define-private (new-payment-link-id)
  (let (
      (counter (var-get payment-link-ctr))
      (timestamp (current-time))
    )
    (var-set payment-link-ctr (+ counter u1))
    (concat
      (concat "LNK_" (int-to-ascii timestamp))
      (concat "_" (int-to-ascii counter))
    )
  )
)

(define-private (store-invoice
    (merchant principal)
    (recipient principal)
    (amount uint)
    (currency (string-ascii 10))
    (expires-in-seconds uint)
    (description (string-utf8 256))
  )
  (let (
      (invoice-id (new-invoice-id))
      (now (current-time))
    )
    (map-set invoices { invoice-id: invoice-id } {
      merchant: merchant,
      recipient: recipient,
      amount: amount,
      currency: currency,
      status: STATUS_PENDING,
      created-at: now,
      expires-at: (+ now expires-in-seconds),
      paid-at: none,
      description: description,
    })
    (var-set invoice-total (+ (var-get invoice-total) u1))
    (print {
      event: "invoice-created",
      invoice-id: invoice-id,
      merchant: merchant,
      recipient: recipient,
      amount: amount,
      currency: currency,
    })
    invoice-id
  )
)

(define-public (set-processor (who principal))
  (begin
    (asserts! (is-eq tx-sender (var-get owner)) ERR_UNAUTHORIZED)
    (var-set processor (some who))
    (ok true)
  )
)

(define-public (create-invoice
    (recipient principal)
    (amount uint)
    (currency (string-ascii 10))
    (expires-in-seconds uint)
    (description (string-utf8 256))
  )
  (begin
    (asserts! (valid-principal recipient) ERR_INVALID_PRINCIPAL)
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    (asserts! (valid-currency currency) ERR_INVALID_INPUT)
    (asserts! (> expires-in-seconds u0) ERR_INVALID_INPUT)
    (ok (store-invoice tx-sender recipient amount currency expires-in-seconds description))
  )
)

(define-public (create-multipay-link
    (recipient principal)
    (slug (string-ascii 64))
    (title (string-utf8 128))
    (description (string-utf8 256))
    (default-currency (optional (string-ascii 10)))
    (default-amount (optional uint))
    (suggested-amount-1 (optional uint))
    (suggested-amount-2 (optional uint))
    (suggested-amount-3 (optional uint))
    (amount-step (optional uint))
    (allow-custom-amount bool)
    (accepts-stx bool)
    (accepts-sbtc bool)
    (accepts-usdcx bool)
  )
  (let (
      (link-id (new-payment-link-id))
      (now (current-time))
      (currency (unwrap! default-currency ERR_INVALID_INPUT))
      (fixed-amount (unwrap! default-amount ERR_INVALID_INPUT))
    )
    (asserts! (valid-principal recipient) ERR_INVALID_PRINCIPAL)
    (asserts! (is-none (map-get? payment-link-slugs { slug: slug })) ERR_INVALID_INPUT)
    (asserts! (not allow-custom-amount) ERR_INVALID_INPUT)
    (asserts! (is-none amount-step) ERR_INVALID_INPUT)
    (asserts! (valid-currency currency) ERR_INVALID_INPUT)
    (asserts! (valid-suggested-amounts suggested-amount-1 suggested-amount-2 suggested-amount-3) ERR_INVALID_AMOUNT)
    (asserts! (currency-enabled currency accepts-stx accepts-sbtc accepts-usdcx) ERR_INVALID_INPUT)
    (asserts!
      (if (is-eq currency CURRENCY_STX)
        (and accepts-stx (and (not accepts-sbtc) (not accepts-usdcx)))
        (if (is-eq currency CURRENCY_SBTC)
          (and accepts-sbtc (and (not accepts-stx) (not accepts-usdcx)))
          (and accepts-usdcx (and (not accepts-stx) (not accepts-sbtc)))
        )
      )
      ERR_INVALID_INPUT
    )
    (asserts!
      (or
        (> fixed-amount u0)
        (any-suggested-amount suggested-amount-1 suggested-amount-2 suggested-amount-3)
      )
      ERR_INVALID_AMOUNT
    )
    (map-set payment-links { link-id: link-id } {
      merchant: tx-sender,
      recipient: recipient,
      slug: slug,
      kind: LINK_KIND_MULTIPAY,
      title: title,
      description: description,
      default-currency: (some currency),
      default-amount: (some fixed-amount),
      suggested-amount-1: suggested-amount-1,
      suggested-amount-2: suggested-amount-2,
      suggested-amount-3: suggested-amount-3,
      amount-step: amount-step,
      allow-custom-amount: allow-custom-amount,
      accepts-stx: accepts-stx,
      accepts-sbtc: accepts-sbtc,
      accepts-usdcx: accepts-usdcx,
      is-active: true,
      created-at: now,
    })
    (map-set payment-link-slugs { slug: slug } { link-id: link-id })
    (var-set payment-link-total (+ (var-get payment-link-total) u1))
    (print {
      event: "payment-link-created",
      link-id: link-id,
      merchant: tx-sender,
      slug: slug,
    })
    (ok link-id)
  )
)

(define-read-only (get-payment-link-view (link-id (string-ascii 85)))
  (ok (map-get? payment-links { link-id: link-id }))
)

(define-public (create-universal-qr-link
    (recipient principal)
    (slug (string-ascii 64))
    (title (string-utf8 128))
    (description (string-utf8 256))
  )
  (let (
      (link-id (new-payment-link-id))
      (now (current-time))
    )
    (asserts! (valid-principal recipient) ERR_INVALID_PRINCIPAL)
    (asserts! (is-none (map-get? payment-link-slugs { slug: slug })) ERR_INVALID_INPUT)
    (map-set payment-links { link-id: link-id } {
      merchant: tx-sender,
      recipient: recipient,
      slug: slug,
      kind: LINK_KIND_UNIVERSAL,
      title: title,
      description: description,
      default-currency: none,
      default-amount: none,
      suggested-amount-1: none,
      suggested-amount-2: none,
      suggested-amount-3: none,
      amount-step: none,
      allow-custom-amount: true,
      accepts-stx: true,
      accepts-sbtc: true,
      accepts-usdcx: true,
      is-active: true,
      created-at: now,
    })
    (map-set payment-link-slugs { slug: slug } { link-id: link-id })
    (var-set payment-link-total (+ (var-get payment-link-total) u1))
    (print {
      event: "payment-link-created",
      link-id: link-id,
      merchant: tx-sender,
      slug: slug,
    })
    (ok link-id)
  )
)

(define-public (create-public-invoice-from-link
    (link-id (string-ascii 85))
    (currency (string-ascii 10))
    (amount uint)
    (expires-in-seconds uint)
    (description (string-utf8 256))
  )
  (let ((link (unwrap! (map-get? payment-links { link-id: link-id }) ERR_LINK_NOT_FOUND)))
    (asserts! (get is-active link) ERR_INVALID_STATUS)
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    (asserts! (valid-currency currency) ERR_INVALID_INPUT)
    (asserts! (> expires-in-seconds u0) ERR_INVALID_INPUT)
    (asserts!
      (currency-enabled currency (get accepts-stx link) (get accepts-sbtc link) (get accepts-usdcx link))
      ERR_INVALID_INPUT
    )
    (if (is-eq (get kind link) LINK_KIND_MULTIPAY)
      (begin
        (asserts! (not (get allow-custom-amount link)) ERR_INVALID_INPUT)
        (asserts! (is-eq (some currency) (get default-currency link)) ERR_INVALID_INPUT)
        (if
          (any-suggested-amount
            (get suggested-amount-1 link)
            (get suggested-amount-2 link)
            (get suggested-amount-3 link)
          )
          (asserts!
            (amount-in-suggestions
              amount
              (get suggested-amount-1 link)
              (get suggested-amount-2 link)
              (get suggested-amount-3 link)
            )
            ERR_INVALID_AMOUNT
          )
          (asserts! (is-eq (some amount) (get default-amount link)) ERR_INVALID_AMOUNT)
        )
      )
      (match (get default-amount link)
        default-amount
          (if (get allow-custom-amount link)
            true
            (asserts! (is-eq amount default-amount) ERR_INVALID_AMOUNT)
          )
        true
      )
    )
    (ok (store-invoice
      (get merchant link)
      (get recipient link)
      amount
      currency
      expires-in-seconds
      (if (or (is-eq (get kind link) LINK_KIND_MULTIPAY) (is-eq description u""))
        (get title link)
        description
      )
    ))
  )
)

(define-public (process-payment
    (invoice-id (string-ascii 85))
    (payer principal)
    (amount uint)
  )
  (begin
    (asserts! (authorized-processor-caller) ERR_UNAUTHORIZED)
    (let (
        (invoice (unwrap! (map-get? invoices { invoice-id: invoice-id }) ERR_INVOICE_NOT_FOUND))
        (now (current-time))
      )
      (asserts! (is-eq (effective-status invoice) STATUS_PENDING) ERR_INVALID_STATUS)
      (asserts! (is-eq amount (get amount invoice)) ERR_INSUFFICIENT_PAYMENT)
      (map-set invoices { invoice-id: invoice-id }
        (merge invoice {
          status: STATUS_PAID,
          paid-at: (some now),
        })
      )
      (let ((receipt-id (new-receipt-id)))
        (map-set receipts { receipt-id: receipt-id } {
          invoice-id: invoice-id,
          payer: payer,
          amount-paid: amount,
          timestamp: now,
        })
        (var-set receipt-total (+ (var-get receipt-total) u1))
        (print {
          event: "invoice-paid",
          invoice-id: invoice-id,
          receipt-id: receipt-id,
          merchant: (get merchant invoice),
          payer: payer,
          amount: amount,
          currency: (get currency invoice),
        })
        (ok receipt-id)
      )
    )
  )
)

(define-public (expire-invoice (invoice-id (string-ascii 85)))
  (let ((invoice (unwrap! (map-get? invoices { invoice-id: invoice-id }) ERR_INVOICE_NOT_FOUND)))
    (asserts!
      (or
        (is-eq tx-sender (get merchant invoice))
        (is-eq tx-sender (var-get owner))
      )
      ERR_UNAUTHORIZED
    )
    (asserts! (is-eq (effective-status invoice) STATUS_EXPIRED) ERR_INVALID_STATUS)
    (map-set invoices { invoice-id: invoice-id }
      (merge invoice { status: STATUS_EXPIRED })
    )
    (ok true)
  )
)

(define-read-only (get-current-time)
  (ok (current-time))
)

(define-read-only (get-invoice (invoice-id (string-ascii 85)))
  (ok (map-get? invoices { invoice-id: invoice-id }))
)

(define-read-only (get-invoice-view (invoice-id (string-ascii 85)))
  (match (map-get? invoices { invoice-id: invoice-id })
    invoice
      (ok (some (merge invoice {
        status: (effective-status invoice),
      })))
    (ok none)
  )
)

(define-read-only (get-receipt (receipt-id (string-ascii 85)))
  (ok (map-get? receipts { receipt-id: receipt-id }))
)

(define-read-only (get-payment-link (link-id (string-ascii 85)))
  (ok (map-get? payment-links { link-id: link-id }))
)

(define-read-only (get-payment-link-by-slug (slug (string-ascii 64)))
  (match (map-get? payment-link-slugs { slug: slug })
    ref
      (ok (map-get? payment-links { link-id: (get link-id ref) }))
    (ok none)
  )
)

(define-read-only (is-invoice-payable (invoice-id (string-ascii 85)))
  (match (map-get? invoices { invoice-id: invoice-id })
    invoice
      (is-eq (effective-status invoice) STATUS_PENDING)
    false
  )
)

(define-read-only (get-invoice-count)
  (ok (var-get invoice-total))
)

(define-read-only (get-receipt-count)
  (ok (var-get receipt-total))
)

(define-read-only (get-payment-link-count)
  (ok (var-get payment-link-total))
)
