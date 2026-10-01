/** Runs once when the server starts. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertProductionConfiguration } = await import("./lib/server/config-check");
    assertProductionConfiguration();
  }
}
