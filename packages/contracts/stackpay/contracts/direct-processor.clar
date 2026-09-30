;; StackPay Direct Processor (prototype, see docs/adr/0001-settlement-model.md)
;;
;; Non-custodial alternative to `proc`: the payer's funds move straight to the invoice's
;; recipient in the same transaction that marks the invoice paid. This contract never holds
;; funds, keeps no balances, and has no withdrawal path. If any step fails, the whole
;; transaction (transfer included) is rolled back by Clarity.
;;
;; Authorization: the architecture contract accepts this processor only after its owner calls
;; `set-processor` with this contract's principal.

(define-trait sip-010-trait (
  (transfer (uint principal principal (optional (buff 34))) (response bool uint))
))

(define-constant ERR_INVALID_TOKEN (err u401))
(define-constant ERR_PAYMENT_FAILED (err u402))
(define-constant ERR_INVALID_AMOUNT (err u405))
(define-constant ERR_INVALID_INPUT (err u407))

(define-constant CURRENCY_STX "STX")
(define-constant CURRENCY_SBTC "sBTC")
(define-constant CURRENCY_USDC "USDCx")

(define-private (supported-token-contract (currency (string-ascii 10)))
  (if (is-eq currency CURRENCY_SBTC)
    (some 'SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token)
    (if (is-eq currency CURRENCY_USDC)
      (some 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx)
      none
    )
  )
)

(define-public (process-stx-payment
    (invoice-id (string-ascii 85))
    (amount uint)
  )
  (let (
      (payer tx-sender)
      (invoice (unwrap! (contract-call? .arch get-invoice invoice-id) ERR_PAYMENT_FAILED))
    )
    (match invoice
      found (begin
        (asserts! (is-eq (get currency found) CURRENCY_STX) ERR_INVALID_INPUT)
        (asserts! (> amount u0) ERR_INVALID_AMOUNT)
        (asserts! (is-eq amount (get amount found)) ERR_INVALID_AMOUNT)
        ;; Mark paid first: status/expiry checks happen before any money moves.
        (let ((receipt-id (try! (contract-call? .arch process-payment invoice-id payer amount))))
          (try! (stx-transfer? amount payer (get recipient found)))
          (ok receipt-id)
        )
      )
      ERR_PAYMENT_FAILED
    )
  )
)

(define-public (process-sip-010-payment
    (invoice-id (string-ascii 85))
    (amount uint)
    (token <sip-010-trait>)
  )
  (let (
      (payer tx-sender)
      (invoice (unwrap! (unwrap! (contract-call? .arch get-invoice invoice-id) ERR_PAYMENT_FAILED) ERR_PAYMENT_FAILED))
      (currency (get currency invoice))
      (expected-token (unwrap! (supported-token-contract currency) ERR_INVALID_TOKEN))
    )
    (asserts! (is-eq expected-token (contract-of token)) ERR_INVALID_TOKEN)
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    (asserts! (is-eq amount (get amount invoice)) ERR_INVALID_AMOUNT)
    (let ((receipt-id (try! (contract-call? .arch process-payment invoice-id payer amount))))
      (try! (contract-call? token transfer amount payer (get recipient invoice) none))
      (ok receipt-id)
    )
  )
)
