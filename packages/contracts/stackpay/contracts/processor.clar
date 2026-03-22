;; StackPay Processor
;; Compact balance ledger for invoice payments and merchant withdrawals.

(use-trait invoice-trait .architecture.invoice-trait)

(define-trait sip-010-trait (
  (transfer (uint principal principal (optional (buff 34))) (response bool uint))
))

(define-constant ERR_UNAUTHORIZED (err u400))
(define-constant ERR_INVALID_TOKEN (err u401))
(define-constant ERR_PAYMENT_FAILED (err u402))
(define-constant ERR_INVALID_AMOUNT (err u405))
(define-constant ERR_INVALID_INPUT (err u407))
(define-constant ERR_INSUFFICIENT_BALANCE (err u413))
(define-constant ERR_ASSET_GUARD (err u414))

(define-constant CURRENCY_STX "STX")
(define-constant CURRENCY_SBTC "sBTC")
(define-constant CURRENCY_USDC "USDCx")

(define-map balances
  {
    merchant: principal,
    currency: (string-ascii 10),
  }
  { amount: uint }
)

(define-private (credit-balance
    (merchant principal)
    (currency (string-ascii 10))
    (amount uint)
  )
  (let ((current
      (default-to
        { amount: u0 }
        (map-get? balances {
          merchant: merchant,
          currency: currency,
        })
      )
    ))
    (map-set balances {
      merchant: merchant,
      currency: currency,
    } {
      amount: (+ (get amount current) amount)
    })
  )
)

(define-private (debit-balance
    (merchant principal)
    (currency (string-ascii 10))
    (amount uint)
  )
  (let ((current (unwrap!
      (map-get? balances {
        merchant: merchant,
        currency: currency,
      })
      ERR_INSUFFICIENT_BALANCE
    )))
    (asserts! (>= (get amount current) amount) ERR_INSUFFICIENT_BALANCE)
    (map-set balances {
      merchant: merchant,
      currency: currency,
    } {
      amount: (- (get amount current) amount)
    })
    (ok true)
  )
)

(define-private (supported-token-contract (currency (string-ascii 10)))
  (if (is-eq currency CURRENCY_SBTC)
    (some 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token)
    (if (is-eq currency CURRENCY_USDC)
      (some 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx)
      none
    )
  )
)

(define-private (valid-recipient (recipient principal))
  (and
    (not (is-eq recipient 'SP000000000000000000002Q6VF78))
    (not (is-eq recipient 'ST000000000000000000002AMW42H))
    true
  )
)

(define-public (process-stx-payment
    (invoice-id (string-ascii 85))
    (amount uint)
  )
  (let (
      (payer tx-sender)
      (invoice (unwrap!
        (unwrap! (contract-call? .architecture get-invoice invoice-id) ERR_PAYMENT_FAILED)
        ERR_PAYMENT_FAILED
      ))
      (merchant (get merchant invoice))
    )
    (asserts! (is-eq (get currency invoice) CURRENCY_STX) ERR_INVALID_INPUT)
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    (asserts! (is-eq amount (get amount invoice)) ERR_INVALID_AMOUNT)
    (try! (stx-transfer? amount payer current-contract))
    (credit-balance merchant CURRENCY_STX amount)
    (contract-call? .architecture process-payment invoice-id payer amount)
  )
)

(define-public (process-sip-010-payment
    (invoice-id (string-ascii 85))
    (amount uint)
    (token <sip-010-trait>)
  )
  (let (
      (payer tx-sender)
      (invoice (unwrap!
        (unwrap! (contract-call? .architecture get-invoice invoice-id) ERR_PAYMENT_FAILED)
        ERR_PAYMENT_FAILED
      ))
      (currency (get currency invoice))
      (merchant (get merchant invoice))
      (expected-token (unwrap! (supported-token-contract currency) ERR_INVALID_TOKEN))
    )
    (asserts!
      (or
        (is-eq currency CURRENCY_SBTC)
        (is-eq currency CURRENCY_USDC)
      )
      ERR_INVALID_INPUT
    )
    (asserts! (is-eq expected-token (contract-of token)) ERR_INVALID_TOKEN)
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    (asserts! (is-eq amount (get amount invoice)) ERR_INVALID_AMOUNT)
    (try! (contract-call? token transfer amount payer current-contract none))
    (credit-balance merchant currency amount)
    (contract-call? .architecture process-payment invoice-id payer amount)
  )
)

(define-public (withdraw-stx-to
    (amount uint)
    (recipient principal)
  )
  (let ((merchant tx-sender))
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    (asserts! (valid-recipient recipient) ERR_INVALID_INPUT)
    (try! (debit-balance merchant CURRENCY_STX amount))
    (unwrap!
      (as-contract? ((with-stx amount))
        (unwrap! (stx-transfer? amount current-contract recipient) ERR_PAYMENT_FAILED)
        true
      )
      ERR_ASSET_GUARD
    )
    (print {
      event: "settlement-completed",
      merchant: merchant,
      recipient: recipient,
      currency: CURRENCY_STX,
      amount: amount,
    })
    (ok {
      withdrawn: amount,
      recipient: recipient,
    })
  )
)

(define-public (withdraw-stx (amount uint))
  (withdraw-stx-to amount tx-sender)
)

(define-public (withdraw-token-to
    (currency (string-ascii 10))
    (amount uint)
    (token <sip-010-trait>)
    (recipient principal)
  )
  (let (
      (merchant tx-sender)
      (expected-token (unwrap! (supported-token-contract currency) ERR_INVALID_TOKEN))
    )
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    (asserts! (valid-recipient recipient) ERR_INVALID_INPUT)
    (asserts! (is-eq expected-token (contract-of token)) ERR_INVALID_TOKEN)
    (try! (debit-balance merchant currency amount))
    (unwrap!
      (as-contract? ((with-ft expected-token "*" amount))
        (unwrap!
          (contract-call? token transfer amount current-contract recipient none)
          ERR_PAYMENT_FAILED
        )
        true
      )
      ERR_ASSET_GUARD
    )
    (print {
      event: "settlement-completed",
      merchant: merchant,
      recipient: recipient,
      currency: currency,
      amount: amount,
    })
    (ok {
      withdrawn: amount,
      recipient: recipient,
    })
  )
)

(define-public (withdraw-token
    (currency (string-ascii 10))
    (amount uint)
    (token <sip-010-trait>)
  )
  (withdraw-token-to currency amount token tx-sender)
)

(define-read-only (get-balance
    (merchant principal)
    (currency (string-ascii 10))
  )
  (map-get? balances {
    merchant: merchant,
    currency: currency,
  })
)
