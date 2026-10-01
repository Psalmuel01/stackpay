import { apiFailure, jsonOk } from "@/lib/server/http";
import { requireMerchant } from "@/lib/server/wallet-auth";
import { createApiKey, createKeySchema, listApiKeys } from "@/lib/server/api-keys";
import { readJsonObject } from "@/lib/server/request-body";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return jsonOk(await listApiKeys(await requireMerchant(request)));
  } catch (error) {
    return apiFailure(error);
  }
}

/** Creates a key. The secret appears only in this response. */
export async function POST(request: Request) {
  try {
    const wallet = await requireMerchant(request);
    const body = createKeySchema.parse(await readJsonObject(request));
    const response = jsonOk(await createApiKey(wallet, body), { status: 201 });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return apiFailure(error);
  }
}
