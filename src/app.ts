import Fastify, { type FastifyInstance } from "fastify";
import { sql } from "kysely";
import type { Db } from "./db.js";
import { balanceRoutes } from "./balances/routes.js";
import { expenseRoutes } from "./expenses/routes.js";
import { groupRoutes } from "./groups/routes.js";
import { registerErrorHandler } from "./http/errors.js";
import { memberRoutes } from "./members/routes.js";
import { settlementRoutes } from "./settlements/routes.js";
import { statementRoutes } from "./statements/routes.js";
import { transactionRoutes } from "./transactions/routes.js";

export interface AppDeps {
  db: Db;
  /** Request logging; defaults to on outside tests. */
  logger?: boolean;
}

export function buildApp({ db, logger = process.env.NODE_ENV !== "test" }: AppDeps): FastifyInstance {
  const app = Fastify({ logger });
  registerErrorHandler(app);

  app.get("/health", async () => {
    await sql`select 1`.execute(db);
    return { status: "ok" };
  });

  memberRoutes(app, db);
  groupRoutes(app, db);
  expenseRoutes(app, db);
  settlementRoutes(app, db);
  transactionRoutes(app, db);
  balanceRoutes(app, db);
  statementRoutes(app, db);

  return app;
}
