

import app from "./app";
import { env } from "./config/env";

const port = Number(env.PORT);

app.listen(port, () => {
  console.log(`\n  ▲ TrustBox Backend`);
  console.log(`  ─ ${env.NODE_ENV} · port ${port}`);
  console.log(`  ─ Frontend origin: ${env.FRONTEND_ORIGIN}`);
  console.log(`  ─ Avalanche Fuji: ${env.AVALANCHE_FUJI_RPC}`);
  console.log(`  ─ Health: http://localhost:${port}/health\n`);
});
