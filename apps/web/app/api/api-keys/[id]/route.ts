import { apiFailure, jsonOk } from "@/lib/server/http";
import { requireMerchant } from "@/lib/server/wallet-auth";
import { revokeApiKey } from "@/lib/server/api-keys";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    return jsonOk(await revokeApiKey(await requireMerchant(request), (await context.params).id));
  } catch (error) {
    return apiFailure(error);
  }
}
