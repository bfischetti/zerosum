import { createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Db } from "../db.js";
import type { Trx } from "../ledger/post.js";
import { AppError } from "./errors.js";

const HEADER = "idempotency-key";

function readKey(req: FastifyRequest): string {
  const key = req.headers[HEADER];
  if (typeof key !== "string" || key.length === 0) {
    throw new AppError(400, "missing_idempotency_key", "the Idempotency-Key header is required");
  }
  if (key.length > 255) {
    throw new AppError(400, "invalid_idempotency_key", "Idempotency-Key must be at most 255 characters");
  }
  return key;
}

/** JSON with object keys sorted, so key order in the body doesn't change the hash. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Method, path (with its params) and canonical body: same key elsewhere is a different request. */
export function hashRequest(method: string, url: string, body: unknown): string {
  return createHash("sha256")
    .update(`${method}\n${url}\n${canonicalJson(body)}`)
    .digest("hex");
}

/**
 * Runs a write at most once per Idempotency-Key.
 *
 * The key row is inserted first, in the same DB transaction as the write. A
 * concurrent request with the same key blocks on the primary key until this
 * one finishes: if it commits, the waiter replays the stored response; if it
 * rolls back, the waiter goes ahead. Only successful responses are stored,
 * because any error rolls the key back with the write, so a rejected request
 * can be retried with the same key.
 *
 * Same key with a different request is 422 idempotency_key_reused.
 */
export async function idempotent(
  db: Db,
  req: FastifyRequest,
  reply: FastifyReply,
  status: number,
  write: (trx: Trx) => Promise<unknown>,
): Promise<FastifyReply> {
  const key = readKey(req);
  const hash = hashRequest(req.method, req.url, req.body);

  const outcome = await db.transaction().execute(async (trx) => {
    const claimed = await trx
      .insertInto("idempotency_keys")
      .values({ key, request_hash: hash })
      .onConflict((oc) => oc.column("key").doNothing())
      .returning("key")
      .executeTakeFirst();

    if (!claimed) {
      const stored = await trx
        .selectFrom("idempotency_keys")
        .select(["request_hash", "response_status", "response_body"])
        .where("key", "=", key)
        .executeTakeFirstOrThrow();
      if (stored.request_hash !== hash) {
        throw new AppError(
          422,
          "idempotency_key_reused",
          "this Idempotency-Key was already used for a different request",
        );
      }
      return { replayed: true, status: stored.response_status!, body: stored.response_body };
    }

    // Round-trip through JSON so the first response and every replay are identical.
    const json = JSON.stringify(await write(trx));
    await trx
      .updateTable("idempotency_keys")
      .set({ response_status: status, response_body: json })
      .where("key", "=", key)
      .execute();
    return { replayed: false, status, body: JSON.parse(json) as unknown };
  });

  if (outcome.replayed) reply.header("idempotent-replayed", "true");
  return reply.status(outcome.status).send(outcome.body);
}
