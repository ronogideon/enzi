import { createApp } from "./app";
import { env } from "./config/env";

const app = createApp();
app.listen(env.port, () => {
  console.log(`[enzi] v0.1.0 listening on :${env.port} (${env.nodeEnv})`);
});
