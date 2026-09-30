import { apiFailure, jsonOk } from "@/lib/server/http";
import { requireMerchant } from "@/lib/server/wallet-auth";
import { rotateApiKey } from "@/lib/server/api-keys";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const response = jsonOk(await rotateApiKey(await requireMerchant(request), (await context.params).id), { status: 201 });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return apiFailure(error);
  }
}
