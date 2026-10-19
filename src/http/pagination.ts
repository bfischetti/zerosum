import { z } from "zod";
import { AppError } from "./errors.js";

/**
 * Position in the ledger's order (occurred_at, recorded_at, id). Timestamps
 * are kept as Postgres's own text so their microseconds survive the round
 * trip; a JS Date would truncate them to milliseconds and skip or repeat rows.
 */
export interface Cursor {
  occurredAt: string;
  recordedAt: string;
  id: string;
}

const CursorShape = z.tuple([z.string(), z.string(), z.uuid()]);

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify([c.occurredAt, c.recordedAt, c.id])).toString("base64url");
}

export function decodeCursor(raw: string): Cursor {
  try {
    const [occurredAt, recordedAt, id] = CursorShape.parse(
      JSON.parse(Buffer.from(raw, "base64url").toString("utf8")),
    );
    return { occurredAt, recordedAt, id };
  } catch {
    throw new AppError(400, "invalid_cursor", "cursor is malformed");
  }
}

export const PageQuery = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** Trims the one look-ahead row and derives the next cursor from the last item kept. */
export function page<T>(rows: T[], limit: number, cursorOf: (row: T) => Cursor) {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor: rows.length > limit && last ? encodeCursor(cursorOf(last)) : null,
  };
}
