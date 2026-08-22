import { createStackPayServer } from "./server.js";

// PORT is injected by most hosts; STACKPAY_API_PORT stays supported for local use.
const port = Number(process.env.PORT ?? process.env.STACKPAY_API_PORT ?? 4000);

// Bind 0.0.0.0 so the container is reachable from outside.
createStackPayServer().listen(port, "0.0.0.0", () => {
  console.log(`StackPay API listening on port ${port}`);
});
