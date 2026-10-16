import { buildApp } from "./app.js";
import { config } from "./config.js";
import { createDb } from "./db.js";

const db = createDb(config.databaseUrl);
const app = buildApp({ db });

app.addHook("onClose", async () => {
  await db.destroy();
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}

await app.listen({ port: config.port, host: config.host });
