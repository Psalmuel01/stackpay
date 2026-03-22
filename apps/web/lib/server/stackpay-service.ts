import {
  buildCreatePublicInvoiceFromLinkIntent,
  buildCreateInvoiceIntent,
  buildCreateMultipayLinkIntent,
  buildCreateUniversalQrIntent,
  buildWithdrawStxIntent,
  buildWithdrawTokenIntent,
  type ContractIntent,
} from "@/lib/server/stackpay-contracts";
import { makeEntityKey, makeSlugWithSuffix, slugify } from "@/lib/server/ids";
import { getProcessorBalances, tokenContracts } from "@/lib/server/stacks-api";
import {
  insertRow,
  patchRows,
  selectRows,
  upsertRow,
} from "@/lib/server/supabase-admin";

export type Currency = "sBTC" | "STX" | "USDCx";
type Row = Record<string, any>;

type MerchantProfileInput = {
  walletAddress: string;
  displayName?: string;
  companyName?: string;
  email?: string;
  slug?: string;
  settlementWallet?: string;
  webhookUrl?: string;
  defaultCurrency?: Currency;
  metadata?: Record<string, unknown>;
};

type CreateInvoiceInput = {
  walletAddress: string;
  amount: number;
  currency: Currency;
  description: string;
  customerName?: string;
  customerEmail?: string;
  recipientAddress: string;
  expiresInSeconds?: number | null;
};

type CreatePaymentLinkInput = {
  walletAddress: string;
  kind: "multipay";
  recipientAddress?: string;
  slug?: string;
  title?: string;
  description?: string;
  defaultCurrency?: Currency;
  acceptedCurrencies?: Currency[];
  defaultAmount?: number | null;
  suggestedAmounts?: number[];
  amountStep?: number | null;
  allowCustomAmount?: boolean;
  metadata?: Record<string, unknown>;
};

type CreateUniversalQrInput = {
  walletAddress: string;
  recipientAddress?: string;
  slug?: string;
  title?: string;
  description?: string;
  rotate?: boolean;
};

type ConfirmInvoiceInput = {
  walletAddress: string;
  txId: string;
  onchainId: string;
  amount: number;
  currency: Currency;
  description: string;
  customerName?: string;
  customerEmail?: string;
  recipientAddress: string;
  expiresInSeconds: number;
  confirmedAt?: number | null;
};

type ChainConfirmationInput = {
  id: string;
  txId: string;
  onchainId?: string | null;
};

type PreparePublicInvoiceFromLinkInput = {
  slug: string;
  amount: number;
  currency: Currency;
  customerName?: string;
  customerEmail?: string;
  description?: string;
  expiresInSeconds?: number | null;
};

type ConfirmPublicInvoiceInput = {
  slug: string;
  txId: string;
  onchainId: string;
  amount: number;
  currency: Currency;
  customerName?: string;
  customerEmail?: string;
  description?: string;
  expiresInSeconds: number;
  confirmedAt?: number | null;
};

type ConfirmInvoicePaymentInput = {
  invoiceId: string;
  txId: string;
  receiptId: string;
  payerWalletAddress?: string | null;
  confirmedAt?: number | null;
};

type ChainhookInvoicePaidInput = {
  phase: "apply" | "rollback";
  txId: string;
  invoiceId: string;
  receiptId: string;
  payerWalletAddress?: string | null;
  merchantPrincipal?: string | null;
  amount?: number | null;
  currency?: Currency | null;
  payload: Record<string, unknown>;
};

type PrepareSettlementInput = {
  walletAddress: string;
  currency: Currency;
  amount: number;
  destination?: string | null;
};

type ConfirmSettlementInput = {
  walletAddress: string;
  txId: string;
  currency: Currency;
  amount: number;
  destination: string;
  confirmedAt?: number | null;
};

type DashboardActivityItem = {
  id: string;
  title: string;
  detail: string;
  status: "Paid" | "Pending" | "Expired" | "Active" | "Profile";
  createdAt: string;
  href?: string;
};

const usdRates = {
  sBTC: 68000,
  STX: 2.4,
  USDCx: 1,
} as const;

async function selectSingle<T extends Row>(table: string, query: Record<string, string>) {
  const rows = (await selectRows(table, {
    select: "*",
    ...query,
    limit: 1,
  })) as T[] | null;

  return rows?.[0] ?? null;
}

function toNumericValue(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function ensureWalletAddress(walletAddress: string) {
  const trimmed = walletAddress.trim();
  if (!trimmed) {
    throw new Error("walletAddress is required.");
  }
  return trimmed;
}

function ensurePositiveAmount(amount: number, fieldName: string) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${fieldName} must be greater than zero.`);
  }
}

function normalizeSuggestedAmounts(values: number[] | undefined) {
  const unique = new Set<number>();

  for (const value of values ?? []) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      unique.add(numeric);
    }
  }

  return Array.from(unique).slice(0, 3);
}

async function recordActivity(
  merchantId: string,
  entityType: string,
  entityId: string,
  eventType: string,
  payload: Record<string, unknown>,
  txId?: string | null
) {
  await insertRow("activity_events", {
    merchant_id: merchantId,
    entity_type: entityType,
    entity_id: entityId,
    event_type: eventType,
    tx_id: txId ?? null,
    payload,
  });
}

function merchantDisplayName(merchant: Row | null) {
  if (!merchant) {
    return "";
  }

  const companyName = String(merchant.company_name ?? "").trim();
  const displayName = String(merchant.display_name ?? "").trim();
  return companyName || displayName;
}

function assertValidBusinessName(value: string) {
  if (value.trim().length <= 6) {
    throw new Error("Business name must be longer than 6 characters.");
  }

  if (!slugify(value)) {
    throw new Error("Business name must contain letters or numbers.");
  }
}

function assertValidDisplayName(value: string) {
  if (!value.trim()) {
    throw new Error("Display name is required.");
  }
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function assertValidMerchantEmail(value: string) {
  if (!value.trim()) {
    throw new Error("Email address is required.");
  }

  if (!isValidEmail(value.trim())) {
    throw new Error("Enter a valid email address.");
  }
}

function assertMerchantSetupReady(merchant: Row | null) {
  if (!merchant) {
    throw new Error("Complete your merchant settings before creating an invoice.");
  }

  assertValidBusinessName(String(merchant.company_name ?? ""));
  assertValidDisplayName(String(merchant.display_name ?? ""));
  assertValidMerchantEmail(String(merchant.email ?? ""));
}

async function syncExpiredInvoices(filters: Record<string, string>) {
  const invoices = (await selectRows("invoices", {
    select: "id,status,expires_at",
    ...filters,
  })) as Row[] | null;

  const now = Date.now();
  const expiredIds =
    invoices
      ?.filter((invoice) => {
        const expiresAt = invoice.expires_at ? Date.parse(String(invoice.expires_at)) : Number.NaN;
        return invoice.status === "pending" && Number.isFinite(expiresAt) && expiresAt <= now;
      })
      .map((invoice) => String(invoice.id)) ?? [];

  for (const id of expiredIds) {
    await patchRows("invoices", { id }, { status: "expired" });
  }
}

export async function getMerchantProfileByWallet(walletAddress: string) {
  return selectSingle<Row>("merchant_profiles", {
    wallet_address: `eq.${ensureWalletAddress(walletAddress)}`,
  });
}

export async function getSettlementDashboard(walletAddress: string) {
  const merchant = await getMerchantProfileByWallet(walletAddress);
  const processorBalances = await getProcessorBalances(walletAddress);

  if (!merchant) {
    return {
      merchant: null,
      processorBalances,
      settlementRuns: [],
    };
  }

  const settlementRuns = (await selectRows("settlement_runs", {
    select: "*",
    merchant_id: `eq.${merchant.id as string}`,
    order: "created_at.desc",
    limit: 20,
  })) as Row[];

  return {
    merchant: {
      company_name: merchant.company_name ?? "",
      display_name: merchant.display_name ?? "",
      email: merchant.email ?? "",
      slug: merchant.slug ?? "",
      settlement_wallet: merchant.settlement_wallet ?? walletAddress,
    },
    processorBalances,
    settlementRuns,
  };
}

export async function upsertMerchantProfile(input: MerchantProfileInput) {
  const walletAddress = ensureWalletAddress(input.walletAddress);
  const existingMerchant = await getMerchantProfileByWallet(walletAddress);
  const nextCompanyName =
    input.companyName !== undefined
      ? input.companyName.trim()
      : String(existingMerchant?.company_name ?? "").trim();
  const nextDisplayName =
    input.displayName !== undefined
      ? input.displayName.trim()
      : String(existingMerchant?.display_name ?? "");
  const nextEmail =
    input.email !== undefined
      ? input.email.trim()
      : String(existingMerchant?.email ?? "");
  assertValidBusinessName(nextCompanyName);
  assertValidDisplayName(nextDisplayName);
  assertValidMerchantEmail(nextEmail);
  const nextSlug =
    existingMerchant &&
    String(existingMerchant.company_name ?? "").trim() === nextCompanyName &&
    String(existingMerchant.slug ?? "").trim()
      ? String(existingMerchant.slug)
      : makeSlugWithSuffix(nextCompanyName);

  const merchant = await upsertRow(
    "merchant_profiles",
    {
      wallet_address: walletAddress,
      display_name: nextDisplayName,
      company_name: nextCompanyName,
      email: nextEmail,
      slug: nextSlug,
      settlement_wallet:
        input.settlementWallet !== undefined
          ? input.settlementWallet
          : String(existingMerchant?.settlement_wallet ?? walletAddress),
      webhook_url:
        input.webhookUrl !== undefined
          ? input.webhookUrl || null
          : (existingMerchant?.webhook_url ?? null),
      default_currency:
        input.defaultCurrency !== undefined
          ? input.defaultCurrency
          : (existingMerchant?.default_currency ?? "sBTC"),
      metadata:
        input.metadata !== undefined
          ? input.metadata
          : (existingMerchant?.metadata ?? {}),
    },
    "wallet_address"
  );

  if (!merchant) {
    throw new Error("Failed to upsert merchant profile.");
  }

  await upsertRow(
    "merchant_wallets",
    {
      merchant_id: merchant.id,
      wallet_address: walletAddress,
      network: process.env.NEXT_PUBLIC_STACKS_NETWORK ?? "testnet",
      label: "Primary wallet",
      is_primary: true,
    },
    "wallet_address"
  );

  return merchant;
}

export async function listInvoicesForWallet(walletAddress: string) {
  const merchant = await getMerchantProfileByWallet(walletAddress);
  if (!merchant) {
    return [];
  }

  await syncExpiredInvoices({
    merchant_id: `eq.${merchant.id as string}`,
  });

  return (await selectRows("invoices", {
    select: "*",
    merchant_id: `eq.${merchant.id as string}`,
    order: "created_at.desc",
  })) as Row[];
}

export async function getInvoiceByIdOrOnchainId(invoiceId: string) {
  await syncExpiredInvoices({
    onchain_invoice_id: `eq.${invoiceId}`,
  });

  return selectSingle<Row>("invoices", {
    onchain_invoice_id: `eq.${invoiceId}`,
  });
}

export async function getInvoiceDetailsByOnchainId(invoiceId: string) {
  const invoice = await getInvoiceByIdOrOnchainId(invoiceId);
  if (!invoice) {
    return null;
  }

  const merchant = await selectSingle<Row>("merchant_profiles", {
    id: `eq.${String(invoice.merchant_id)}`,
  });
  const receipt = await selectSingle<Row>("receipts", {
    invoice_id: `eq.${String(invoice.id)}`,
    order: "created_at.desc",
  });

  return {
    ...invoice,
    merchant: merchant
      ? {
          display_name: merchant.display_name ?? "",
          company_name: merchant.company_name ?? "",
          slug: merchant.slug ?? "",
          email: merchant.email ?? "",
          settlement_wallet: merchant.settlement_wallet ?? "",
        }
      : null,
    receipt: receipt
      ? {
          onchain_receipt_id: receipt.onchain_receipt_id ?? "",
          tx_id: receipt.tx_id ?? "",
          payer_wallet_address: receipt.payer_wallet_address ?? "",
          paid_at: receipt.paid_at ?? null,
        }
      : null,
  };
}

export async function getReceiptDetailsByReceiptId(receiptId: string) {
  const receipt = await selectSingle<Row>("receipts", {
    onchain_receipt_id: `eq.${receiptId}`,
  });

  if (!receipt) {
    return null;
  }

  const invoice = await selectSingle<Row>("invoices", {
    id: `eq.${String(receipt.invoice_id)}`,
  });
  const merchant = invoice
    ? await selectSingle<Row>("merchant_profiles", {
        id: `eq.${String(invoice.merchant_id)}`,
      })
    : null;

  return {
    receipt: {
      id: String(receipt.id),
      onchain_receipt_id: String(receipt.onchain_receipt_id ?? receipt.receipt_key ?? ""),
      tx_id: String(receipt.tx_id ?? ""),
      payer_wallet_address: String(receipt.payer_wallet_address ?? ""),
      paid_at: String(receipt.paid_at ?? ""),
      amount: toNumericValue(receipt.amount),
      currency: String(receipt.currency) as Currency,
    },
    invoice: invoice
      ? {
          onchain_invoice_id: String(invoice.onchain_invoice_id ?? ""),
          description: String(invoice.description ?? ""),
          customer_name: String(invoice.customer_name ?? ""),
          customer_email: String(invoice.customer_email ?? ""),
          recipient_address: String(invoice.recipient_address ?? ""),
          created_at: String(invoice.created_at ?? ""),
          paid_at: String(invoice.paid_at ?? ""),
        }
      : null,
    merchant: merchant
      ? {
          company_name: String(merchant.company_name ?? ""),
          display_name: String(merchant.display_name ?? ""),
          email: String(merchant.email ?? ""),
          slug: String(merchant.slug ?? ""),
          settlement_wallet: String(merchant.settlement_wallet ?? ""),
        }
      : null,
  };
}

export async function prepareInvoiceCreation(input: CreateInvoiceInput) {
  ensurePositiveAmount(input.amount, "amount");
  const walletAddress = ensureWalletAddress(input.walletAddress);
  const merchant = await getMerchantProfileByWallet(walletAddress);
  assertMerchantSetupReady(merchant);
  const expiresInSeconds =
    input.expiresInSeconds && input.expiresInSeconds > 0 ? input.expiresInSeconds : 86_400;
  const recipientAddress = input.recipientAddress?.trim() || walletAddress;
  const contractIntent = buildCreateInvoiceIntent({
    recipientAddress,
    amount: input.amount,
    currency: input.currency,
    expiresInSeconds,
    description: input.description,
  });

  return {
    merchant,
    contractIntent,
    invoice: {
      amount: input.amount,
      currency: input.currency,
      description: input.description,
      customer_name: input.customerName ?? "",
      customer_email: input.customerEmail ?? "",
      recipient_address: recipientAddress,
      expires_in_seconds: expiresInSeconds,
    },
  };
}

export async function confirmInvoiceCreation(input: ConfirmInvoiceInput) {
  ensurePositiveAmount(input.amount, "amount");
  const walletAddress = ensureWalletAddress(input.walletAddress);
  const merchant = await upsertMerchantProfile({
    walletAddress,
    settlementWallet: input.recipientAddress || walletAddress,
  });

  const confirmedAtMs =
    typeof input.confirmedAt === "number" && input.confirmedAt > 0
      ? input.confirmedAt * 1000
      : Date.now();

  const invoice = await upsertRow(
    "invoices",
    {
      merchant_id: merchant.id,
      onchain_invoice_id: input.onchainId,
      tx_id: input.txId,
      status: "pending",
      amount: input.amount,
      currency: input.currency,
      description: input.description,
      customer_name: input.customerName ?? "",
      customer_email: input.customerEmail ?? "",
      recipient_address: input.recipientAddress || walletAddress,
      expires_at: new Date(confirmedAtMs + input.expiresInSeconds * 1000).toISOString(),
    },
    "onchain_invoice_id"
  );

  await recordActivity(
    merchant.id as string,
    "invoice",
    input.onchainId,
    "invoice.created",
    {
      onchainInvoiceId: input.onchainId,
      amount: input.amount,
      currency: input.currency,
    },
    input.txId
  );

  return invoice;
}

export async function prepareSettlementWithdrawal(input: PrepareSettlementInput) {
  const walletAddress = ensureWalletAddress(input.walletAddress);
  const merchant = await getMerchantProfileByWallet(walletAddress);
  if (!merchant) {
    throw new Error("Complete your merchant profile before settling funds.");
  }

  ensurePositiveAmount(input.amount, "amount");
  const destination = input.destination?.trim() || String(merchant.settlement_wallet ?? walletAddress);
  if (!destination) {
    throw new Error("A settlement destination is required.");
  }

  const processorBalances = await getProcessorBalances(walletAddress);
  const availableBalance = processorBalances[input.currency];
  if (input.amount > availableBalance) {
    throw new Error(`Insufficient ${input.currency} balance in the processor.`);
  }

  const contractIntent =
    input.currency === "STX"
      ? buildWithdrawStxIntent({
          amount: input.amount,
          recipientAddress: destination,
        })
      : buildWithdrawTokenIntent({
          currency: input.currency,
          amount: input.amount,
          tokenContract: tokenContracts[input.currency],
          recipientAddress: destination,
        });

  return {
    merchant,
    contractIntent,
    settlement: {
      currency: input.currency,
      amount: input.amount,
      destination,
    },
  };
}

export async function confirmSettlementWithdrawal(input: ConfirmSettlementInput) {
  const walletAddress = ensureWalletAddress(input.walletAddress);
  const merchant = await getMerchantProfileByWallet(walletAddress);
  if (!merchant) {
    throw new Error("Merchant profile not found.");
  }

  ensurePositiveAmount(input.amount, "amount");

  const executedAt =
    typeof input.confirmedAt === "number" && input.confirmedAt > 0
      ? new Date(input.confirmedAt * 1000).toISOString()
      : new Date().toISOString();

  const settlementRun = await upsertRow(
    "settlement_runs",
    {
      merchant_id: merchant.id,
      tx_id: input.txId,
      currency: input.currency,
      amount: input.amount,
      destination: input.destination,
      status: "completed",
      executed_at: executedAt,
      metadata: {},
    },
    "tx_id"
  );

  await recordActivity(
    String(merchant.id),
    "settlement_run",
    String(settlementRun.id),
    "settlement.completed",
    {
      txId: input.txId,
      currency: input.currency,
      amount: input.amount,
      destination: input.destination,
    },
    input.txId
  );

  return settlementRun;
}

export async function listPaymentLinksForWallet(walletAddress: string) {
  const merchant = await getMerchantProfileByWallet(walletAddress);
  if (!merchant) {
    return [];
  }

  return (await selectRows("payment_links", {
    select: "*",
    merchant_id: `eq.${merchant.id as string}`,
    order: "created_at.desc",
  })) as Row[];
}

export async function getPublicPaymentLinkBySlug(slug: string) {
  const paymentLink = await selectSingle<Row>("payment_links", {
    slug: `eq.${slug}`,
    is_active: "eq.true",
  });

  if (!paymentLink) {
    return null;
  }

  const merchant = await selectSingle<Row>("merchant_profiles", {
    id: `eq.${String(paymentLink.merchant_id)}`,
  });

  return {
    ...paymentLink,
    merchant: merchant
      ? {
          display_name: merchant.display_name ?? "",
          company_name: merchant.company_name ?? "",
          slug: merchant.slug ?? "",
          settlement_wallet: merchant.settlement_wallet ?? "",
        }
      : null,
  };
}

export async function createPaymentLinkDraft(input: CreatePaymentLinkInput) {
  const merchant = await getMerchantProfileByWallet(input.walletAddress);
  assertMerchantSetupReady(merchant);
  const ensuredMerchant = merchant as Row;
  const merchantBaseSlug = slugify(String(ensuredMerchant.slug ?? ensuredMerchant.company_name ?? ""));
  const recipientAddress =
    input.recipientAddress?.trim() ||
    String(ensuredMerchant.settlement_wallet || input.walletAddress);
  const defaultCurrency = input.defaultCurrency ?? "sBTC";
  const suggestedAmounts = normalizeSuggestedAmounts(input.suggestedAmounts);
  const pricingMode = suggestedAmounts.length > 0 ? "suggested" : "fixed";
  const fixedAmount = Number(input.defaultAmount ?? 0);

  if (input.kind === "multipay" && suggestedAmounts.length === 0 && fixedAmount <= 0) {
    throw new Error("MultiPay requires a fixed amount or at least one suggested amount.");
  }

  const slugSource = input.description?.trim() || input.title?.trim() || "pay";
  const slug = makeSlugWithSuffix(`${merchantBaseSlug}-${slugSource}`);
  const title =
    input.title?.trim() ||
    input.description?.trim() ||
    `${merchantDisplayName(ensuredMerchant) || "Merchant"} payment`;
  const description = input.description?.trim() || title;

  const contractIntent: ContractIntent = buildCreateMultipayLinkIntent({
    recipientAddress,
    slug,
    title,
    description,
    defaultCurrency,
    defaultAmount: suggestedAmounts[0] ?? (fixedAmount > 0 ? fixedAmount : null),
    suggestedAmounts,
    amountStep: null,
    allowCustomAmount: false,
    acceptsStx: defaultCurrency === "STX",
    acceptsSbtc: defaultCurrency === "sBTC",
    acceptsUsdcx: defaultCurrency === "USDCx",
  });

  const linkKey = makeEntityKey("LNK");
  const paymentLink = await insertRow("payment_links", {
    merchant_id: ensuredMerchant.id,
    link_key: linkKey,
    kind: input.kind,
    slug,
    title,
    description,
    linked_invoice_id: null,
    linked_subscription_plan_id: null,
    default_currency: defaultCurrency,
    accepted_currencies: [defaultCurrency],
    default_amount: suggestedAmounts[0] ?? (fixedAmount > 0 ? fixedAmount : null),
    amount_step: null,
    allow_custom_amount: false,
    is_universal: false,
    is_active: true,
    draft_contract_call: contractIntent,
    metadata: {
      ...(input.metadata ?? {}),
      pricingMode,
      suggestedAmounts,
    },
  });

  await recordActivity(ensuredMerchant.id as string, "payment_link", paymentLink.id as string, "payment_link.draft.created", {
    kind: input.kind,
    slug,
  });

  return {
    paymentLink,
    merchant: ensuredMerchant,
    contractIntent,
  };
}

export async function confirmPaymentLinkChain(input: ChainConfirmationInput) {
  const rows = (await patchRows(
    "payment_links",
    { id: input.id },
    {
      tx_id: input.txId,
      onchain_link_id: input.onchainId,
    }
  )) as Row[];

  const paymentLink = rows[0] ?? null;
  if (!paymentLink) {
    throw new Error("Payment link not found.");
  }

  if (paymentLink.is_universal) {
    await patchRows(
      "payment_links",
      {
        merchant_id: String(paymentLink.merchant_id),
        is_universal: "eq.true",
        id: `neq.${String(paymentLink.id)}`,
      },
      {
        is_active: false,
      }
    );

    await patchRows(
      "payment_links",
      { id: String(paymentLink.id) },
      {
        is_active: true,
      }
    );
  }

  await recordActivity(
    paymentLink.merchant_id as string,
    "payment_link",
    paymentLink.id as string,
    "payment_link.chain.submitted",
    {
      onchainLinkId: input.onchainId,
    },
    input.txId
  );

  return paymentLink;
}

export async function getUniversalQrForWallet(walletAddress: string) {
  const merchant = await getMerchantProfileByWallet(walletAddress);
  if (!merchant) {
    return null;
  }

  const activeLink = await selectSingle<Row>("payment_links", {
    merchant_id: `eq.${merchant.id as string}`,
    is_universal: "eq.true",
    is_active: "eq.true",
    order: "created_at.desc",
  });

  if (activeLink) {
    return activeLink;
  }

  return selectSingle<Row>("payment_links", {
    merchant_id: `eq.${merchant.id as string}`,
    is_universal: "eq.true",
    order: "created_at.desc",
  });
}

export async function createUniversalQrDraft(input: CreateUniversalQrInput) {
  const walletAddress = ensureWalletAddress(input.walletAddress);
  const merchant = await getMerchantProfileByWallet(walletAddress);
  assertMerchantSetupReady(merchant);
  const ensuredMerchant = merchant as Row;
  const existingUniversalLink = await getUniversalQrForWallet(walletAddress);

  if (existingUniversalLink && !input.rotate) {
    const restoredLink =
      existingUniversalLink.is_active
        ? existingUniversalLink
        : await patchRows(
            "payment_links",
            { id: String(existingUniversalLink.id) },
            { is_active: true }
          ).then((rows) => (rows as Row[])[0] ?? existingUniversalLink);

    return {
      paymentLink: restoredLink,
      merchant: ensuredMerchant,
      contractIntent: existingUniversalLink.onchain_link_id
        ? null
        : (existingUniversalLink.draft_contract_call ?? null),
      reusedExisting: true,
    };
  }

  const merchantName = merchantDisplayName(ensuredMerchant);
  const merchantSlug = slugify(String(ensuredMerchant.slug ?? merchantName));
  const slug = slugify(
    input.slug ||
      (input.rotate
        ? `${merchantSlug}-pay-${Date.now().toString(36).slice(-6)}`
        : `${merchantSlug}-pay`)
  );
  const title = input.title || `${merchantName} QR`;
  const description =
    input.description || "Multi-purpose payments";
  const recipientAddress =
    input.recipientAddress?.trim() ||
    String(ensuredMerchant.settlement_wallet || walletAddress);
  const contractIntent = buildCreateUniversalQrIntent({
    recipientAddress,
    slug,
    title,
    description,
  });
  const linkKey = makeEntityKey("QR");

  const paymentLink = await insertRow("payment_links", {
    merchant_id: ensuredMerchant.id,
    link_key: linkKey,
    kind: "multipay",
    slug,
    title,
    description,
    default_currency: null,
    accepted_currencies: ["sBTC", "STX", "USDCx"],
    default_amount: null,
    amount_step: null,
    allow_custom_amount: true,
    is_universal: true,
    is_active: true,
    draft_contract_call: contractIntent,
    metadata: {
      source: "universal-qr",
    },
  });

  await recordActivity(ensuredMerchant.id as string, "payment_link", paymentLink.id as string, "payment_link.qr.created", {
    slug,
    universal: true,
  });

  return {
    paymentLink,
    merchant: ensuredMerchant,
    contractIntent,
    reusedExisting: false,
  };
}

export async function preparePublicInvoiceFromLink(input: PreparePublicInvoiceFromLinkInput) {
  ensurePositiveAmount(input.amount, "amount");
  const paymentLink = (await getPublicPaymentLinkBySlug(input.slug)) as Row | null;
  if (!paymentLink) {
    throw new Error("Public payment link not found.");
  }

  if (!paymentLink.onchain_link_id) {
    throw new Error("Public payment link is not confirmed on-chain yet.");
  }

  const acceptedCurrencies = (paymentLink.accepted_currencies as Currency[] | undefined) ?? [];
  if (!acceptedCurrencies.includes(input.currency)) {
    throw new Error("Selected currency is not enabled for this payment link.");
  }

  const defaultAmount = Number(paymentLink.default_amount ?? 0);
  const allowCustomAmount = Boolean(paymentLink.allow_custom_amount);
  const isMultipay = String(paymentLink.kind) === "multipay" && !Boolean(paymentLink.is_universal);
  const defaultCurrency = (paymentLink.default_currency as Currency | null | undefined) ?? null;
  const suggestedAmounts = normalizeSuggestedAmounts(
    ((paymentLink.metadata as Record<string, unknown> | null)?.suggestedAmounts as number[] | undefined) ?? []
  );
  if (isMultipay) {
    if (!defaultCurrency) {
      throw new Error("MultiPay link is missing its fixed currency.");
    }
    if (input.currency !== defaultCurrency) {
      throw new Error("This MultiPay link uses a fixed currency.");
    }
    if (suggestedAmounts.length > 0) {
      if (!suggestedAmounts.includes(Number(input.amount))) {
        throw new Error("Choose one of the suggested amounts for this payment link.");
      }
    } else if (!(defaultAmount > 0) || Number(input.amount) !== defaultAmount) {
      throw new Error("This MultiPay link uses a fixed amount.");
    }
  }
  if (!isMultipay && defaultAmount > 0 && !allowCustomAmount && Number(input.amount) !== defaultAmount) {
    throw new Error("This payment link uses a fixed amount.");
  }

  const expiresInSeconds =
    input.expiresInSeconds && input.expiresInSeconds > 0 ? input.expiresInSeconds : 86_400;
  const description = String(
    isMultipay
      ? paymentLink.description || paymentLink.title || "Payment via StackPay"
      : input.description?.trim() || paymentLink.description || paymentLink.title || "Payment via StackPay"
  ).trim();
  const contractIntent = buildCreatePublicInvoiceFromLinkIntent({
    onchainLinkId: String(paymentLink.onchain_link_id),
    currency: input.currency,
    amount: input.amount,
    expiresInSeconds,
    description,
  });

  return {
    paymentLink,
    contractIntent,
    invoice: {
      amount: input.amount,
      currency: input.currency,
      description,
      customer_name: input.customerName ?? "",
      customer_email: input.customerEmail ?? "",
      expires_in_seconds: expiresInSeconds,
    },
  };
}

export async function confirmPublicInvoiceCreation(input: ConfirmPublicInvoiceInput) {
  ensurePositiveAmount(input.amount, "amount");
  const paymentLink = (await getPublicPaymentLinkBySlug(input.slug)) as Row | null;
  if (!paymentLink) {
    throw new Error("Public payment link not found.");
  }

  const confirmedAtMs =
    typeof input.confirmedAt === "number" && input.confirmedAt > 0
      ? input.confirmedAt * 1000
      : Date.now();

  const invoice = await upsertRow(
    "invoices",
    {
      merchant_id: paymentLink.merchant_id,
      onchain_invoice_id: input.onchainId,
      tx_id: input.txId,
      status: "pending",
      amount: input.amount,
      currency: input.currency,
      description: String(
        input.description?.trim() || paymentLink.description || paymentLink.title || "Payment via StackPay"
      ),
      customer_name: input.customerName ?? "",
      customer_email: input.customerEmail ?? "",
      recipient_address: String(paymentLink.merchant?.settlement_wallet || ""),
      expires_at: new Date(confirmedAtMs + input.expiresInSeconds * 1000).toISOString(),
    },
    "onchain_invoice_id"
  );

  await recordActivity(
    String(paymentLink.merchant_id),
    "invoice",
    input.onchainId,
    "invoice.created.public-link",
    {
      onchainInvoiceId: input.onchainId,
      slug: input.slug,
      amount: input.amount,
      currency: input.currency,
    },
    input.txId
  );

  return invoice;
}

export async function confirmInvoicePayment(input: ConfirmInvoicePaymentInput) {
  const invoice = await getInvoiceByIdOrOnchainId(input.invoiceId);
  if (!invoice) {
    throw new Error("Invoice not found.");
  }

  const paidAt =
    typeof input.confirmedAt === "number" && input.confirmedAt > 0
      ? new Date(input.confirmedAt * 1000).toISOString()
      : new Date().toISOString();

  const rows = (await patchRows(
    "invoices",
    { onchain_invoice_id: input.invoiceId },
    {
      status: "paid",
      paid_at: paidAt,
    }
  )) as Row[];

  const updatedInvoice = rows[0] ?? invoice;

  await upsertRow(
    "receipts",
    {
      merchant_id: updatedInvoice.merchant_id,
      invoice_id: updatedInvoice.id,
      receipt_key: input.receiptId,
      onchain_receipt_id: input.receiptId,
      tx_id: input.txId,
      payer_wallet_address: input.payerWalletAddress ?? null,
      amount: updatedInvoice.amount,
      currency: updatedInvoice.currency,
      paid_at: paidAt,
    },
    "receipt_key"
  );

  await recordActivity(
    String(updatedInvoice.merchant_id),
    "invoice",
    input.invoiceId,
    "invoice.paid",
    {
      onchainInvoiceId: input.invoiceId,
      receiptId: input.receiptId,
    },
    input.txId
  );

  return updatedInvoice;
}

function shortPublicId(value: string) {
  return value.length > 14 ? `${value.slice(0, 10)}...` : value;
}

function formatCurrencyAmount(amount: number, currency: Currency) {
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: currency === "sBTC" ? 8 : 2,
  }).format(amount)} ${currency}`;
}

function buildActivityItem(
  event: Row,
  context: {
    invoicesByOnchainId: Map<string, Row>;
    paymentLinksById: Map<string, Row>;
  }
): DashboardActivityItem {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const invoiceId = String(payload.onchainInvoiceId ?? event.entity_id ?? "");
  const paymentLink = context.paymentLinksById.get(String(event.entity_id));
  const invoice = context.invoicesByOnchainId.get(invoiceId);

  switch (String(event.event_type)) {
    case "invoice.paid":
      return {
        id: String(event.id),
        title: `Invoice ${shortPublicId(invoiceId)} paid`,
        detail:
          invoice && invoice.amount && invoice.currency
            ? `${toNumericValue(invoice.amount)} ${String(invoice.currency)} confirmed on-chain.`
            : "Payment confirmed on-chain.",
        status: "Paid",
        createdAt: String(event.created_at),
        href: invoiceId ? `/pay/${invoiceId}` : "/invoices",
      };
    case "invoice.created":
    case "invoice.created.public-link":
      return {
        id: String(event.id),
        title: `Invoice ${shortPublicId(invoiceId)} created`,
        detail:
          payload.amount && payload.currency
            ? `${String(payload.amount)} ${String(payload.currency)} awaiting payment.`
            : "Invoice is live and ready to be paid.",
        status: "Pending",
        createdAt: String(event.created_at),
        href: invoiceId ? `/pay/${invoiceId}` : "/invoices",
      };
    case "payment_link.chain.submitted":
    case "payment_link.qr.created":
    case "payment_link.draft.created":
      return {
        id: String(event.id),
        title: paymentLink?.is_universal
          ? "Universal QR updated"
          : `${paymentLink?.title || "Payment link"} live`,
        detail: paymentLink?.slug
          ? `/${paymentLink.slug}`
          : "Public payment route is available for checkout.",
        status: "Active",
        createdAt: String(event.created_at),
        href: paymentLink?.slug ? `/pay/link/${paymentLink.slug}` : paymentLink?.is_universal ? "/qr-link" : "/create-invoice",
      };
    default:
      return {
        id: String(event.id),
        title: String(event.event_type).replace(/\./g, " "),
        detail: "Recent merchant activity recorded in StackPay.",
        status: "Profile",
        createdAt: String(event.created_at),
      };
  }
}

function activitySemanticKey(event: Row) {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const eventType = String(event.event_type ?? "");

  if (eventType.startsWith("invoice.")) {
    const invoiceId = String(payload.onchainInvoiceId ?? event.entity_id ?? "");
    return invoiceId ? `invoice:${invoiceId}` : `event:${String(event.id)}`;
  }

  if (eventType.startsWith("payment_link.")) {
    return `payment-link:${String(event.entity_id ?? event.id)}`;
  }

  return `event:${String(event.id)}`;
}

function dedupeActivityEvents(events: Row[]) {
  const seen = new Set<string>();
  const deduped: Row[] = [];

  for (const event of events) {
    const key = activitySemanticKey(event);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(event);
  }

  return deduped;
}

function buildTrendPoints(invoices: Row[]) {
  const byDay = new Map<string, number>();

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    const key = date.toISOString().slice(0, 10);
    byDay.set(key, 0);
  }

  for (const invoice of invoices) {
    if (invoice.status !== "paid") {
      continue;
    }

    const paidAt = String(invoice.paid_at ?? invoice.created_at ?? "");
    const key = paidAt.slice(0, 10);
    if (!byDay.has(key)) {
      continue;
    }

    byDay.set(
      key,
      (byDay.get(key) ?? 0) +
        toNumericValue(invoice.amount) * usdRates[String(invoice.currency) as Currency]
    );
  }

  return Array.from(byDay.entries()).map(([key, value]) => ({
    label: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${key}T00:00:00Z`)),
    value: Math.round(value),
  }));
}

export async function getDashboardData(walletAddress: string) {
  const merchant = await getMerchantProfileByWallet(walletAddress);
  if (!merchant) {
    return {
      merchant: null,
      processorBalances: {
        STX: 0,
        sBTC: 0,
        USDCx: 0,
      },
      stats: {
        totalVolumeUsd: 0,
        paidInvoices: 0,
        openInvoices: 0,
        activePaymentLinks: 0,
        multipayLinks: 0,
        universalQrActive: false,
      },
      trendPoints: [] as Array<{ label: string; value: number }>,
      statusBreakdown: { paid: 0, pending: 0, expired: 0 },
      activity: [] as DashboardActivityItem[],
    };
  }

  await syncExpiredInvoices({
    merchant_id: `eq.${merchant.id as string}`,
  });

  const [invoices, paymentLinks, activityEvents] = await Promise.all([
    selectRows("invoices", {
      select: "*",
      merchant_id: `eq.${merchant.id as string}`,
      order: "created_at.desc",
    }) as Promise<Row[]>,
    selectRows("payment_links", {
      select: "*",
      merchant_id: `eq.${merchant.id as string}`,
      order: "created_at.desc",
    }) as Promise<Row[]>,
    selectRows("activity_events", {
      select: "*",
      merchant_id: `eq.${merchant.id as string}`,
      order: "created_at.desc",
      limit: 20,
    }) as Promise<Row[]>,
  ]);

  const paidInvoices = invoices.filter((invoice) => invoice.status === "paid");
  const pendingInvoices = invoices.filter((invoice) => invoice.status === "pending");
  const expiredInvoices = invoices.filter((invoice) => invoice.status === "expired");
  const activePaymentLinks = paymentLinks.filter((link) => link.is_active);
  const multipayLinks = activePaymentLinks.filter((link) => link.kind === "multipay" && !link.is_universal);
  const universalQr = activePaymentLinks.find((link) => link.is_universal);
  const invoicesByOnchainId = new Map(
    invoices.map((invoice) => [String(invoice.onchain_invoice_id), invoice] as const)
  );
  const paymentLinksById = new Map(
    paymentLinks.map((paymentLink) => [String(paymentLink.id), paymentLink] as const)
  );
  const processorBalances = paidInvoices.reduce(
    (sum, invoice) => {
      const currency = String(invoice.currency) as Currency;
      sum[currency] += toNumericValue(invoice.amount);
      return sum;
    },
    {
      STX: 0,
      sBTC: 0,
      USDCx: 0,
    }
  );

  return {
    merchant: {
      company_name: merchant.company_name ?? "",
      display_name: merchant.display_name ?? "",
      email: merchant.email ?? "",
      slug: merchant.slug ?? "",
      settlement_wallet: merchant.settlement_wallet ?? walletAddress,
    },
    processorBalances,
    stats: {
      totalVolumeUsd: paidInvoices.reduce((sum, invoice) => {
        return sum + toNumericValue(invoice.amount) * usdRates[String(invoice.currency) as Currency];
      }, 0),
      paidInvoices: paidInvoices.length,
      openInvoices: pendingInvoices.length,
      activePaymentLinks: activePaymentLinks.length,
      multipayLinks: multipayLinks.length,
      universalQrActive: Boolean(universalQr),
    },
    trendPoints: buildTrendPoints(invoices),
    statusBreakdown: {
      paid: paidInvoices.length,
      pending: pendingInvoices.length,
      expired: expiredInvoices.length,
    },
    activity: dedupeActivityEvents(activityEvents).map((event) =>
      buildActivityItem(event, {
        invoicesByOnchainId,
        paymentLinksById,
      })
    ),
  };
}

export async function listNotificationsForWallet(walletAddress: string) {
  const merchant = await getMerchantProfileByWallet(walletAddress);
  if (!merchant) {
    return [];
  }

  return (await selectRows("notifications", {
    select: "*",
    merchant_id: `eq.${merchant.id as string}`,
    order: "created_at.desc",
    limit: 20,
  })) as Row[];
}

export async function markNotificationsReadForWallet(walletAddress: string) {
  const merchant = await getMerchantProfileByWallet(walletAddress);
  if (!merchant) {
    return [];
  }

  return (await patchRows(
    "notifications",
    {
      merchant_id: String(merchant.id),
      read_at: "is.null",
    },
    {
      read_at: new Date().toISOString(),
    }
  )) as Row[];
}

export async function processChainhookInvoicePaidEvent(input: ChainhookInvoicePaidInput) {
  const deliveryKey = `${input.phase}:${input.receiptId}:${input.txId}`;

  await upsertRow(
    "chainhook_events",
    {
      delivery_key: deliveryKey,
      event_type: "invoice-paid",
      phase: input.phase,
      tx_id: input.txId,
      receipt_id: input.receiptId,
      invoice_id: input.invoiceId,
      merchant_principal: input.merchantPrincipal ?? null,
      payload: input.payload,
      processed_at: new Date().toISOString(),
    },
    "delivery_key"
  );

  if (input.phase === "rollback") {
    return {
      status: "rollback_recorded" as const,
    };
  }

  const invoice = await getInvoiceByIdOrOnchainId(input.invoiceId);
  if (!invoice) {
    return {
      status: "missing_invoice" as const,
    };
  }

  const updatedInvoice = await confirmInvoicePayment({
    invoiceId: input.invoiceId,
    txId: input.txId,
    receiptId: input.receiptId,
    payerWalletAddress: input.payerWalletAddress ?? null,
  });

  const merchant = await selectSingle<Row>("merchant_profiles", {
    id: `eq.${String(updatedInvoice.merchant_id)}`,
  });

  await upsertRow(
    "notifications",
    {
      merchant_id: updatedInvoice.merchant_id,
      source_key: `invoice-paid:${input.receiptId}`,
      kind: "invoice.paid",
      title: "Invoice paid",
      body: `${formatCurrencyAmount(
        toNumericValue(updatedInvoice.amount),
        String(updatedInvoice.currency) as Currency
      )} received for invoice ${shortPublicId(input.invoiceId)}.`,
      href: `/pay/${input.invoiceId}`,
      level: "success",
      metadata: {
        invoiceId: input.invoiceId,
        receiptId: input.receiptId,
        txId: input.txId,
        payerWalletAddress: input.payerWalletAddress ?? null,
        merchantPrincipal: input.merchantPrincipal ?? merchant?.wallet_address ?? null,
        amount: input.amount ?? toNumericValue(updatedInvoice.amount),
        currency: input.currency ?? String(updatedInvoice.currency),
      },
    },
    "source_key"
  );

  return {
    status: "processed" as const,
    invoice: updatedInvoice,
  };
}
