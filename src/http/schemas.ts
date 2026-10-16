import { z } from "zod";

/** Integer cents, strictly positive. */
export const Cents = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const GroupParams = z.object({ groupId: z.uuid() });

/** ISO 8601 timestamp with an explicit offset, e.g. 2026-10-16T19:30:00Z. */
export const Timestamp = z.iso.datetime({ offset: true }).transform((s) => new Date(s));
