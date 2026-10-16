import Fastify, { type FastifyInstance } from "fastify";
import { sql } from "kysely";
import type { Db } from "./db.js";
import { expenseRoutes } from "./expenses/routes.js";
import { groupRoutes } from "./groups/routes.js";
import { registerErrorHandler } from "./http/errors.js";
import { memberRoutes } from "./members/routes.js";

export interface AppDeps {
  db: Db;
}

export function buildApp({ db }: AppDeps): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });
  registerErrorHandler(app);

  app.get("/health", async () => {
    await sql`select 1`.execute(db);
    return { status: "ok" };
  });

  memberRoutes(app, db);
  groupRoutes(app, db);
  expenseRoutes(app, db);

  return app;
}
