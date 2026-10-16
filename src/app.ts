import Fastify, { type FastifyInstance } from "fastify";
import { sql } from "kysely";
import type { Db } from "./db.js";

export interface AppDeps {
  db: Db;
}

export function buildApp({ db }: AppDeps): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });

  app.get("/health", async () => {
    await sql`select 1`.execute(db);
    return { status: "ok" };
  });

  return app;
}
