import type { FastifyError, FastifyInstance } from "fastify";
import { ZodError } from "zod";

/** An error with an HTTP status and a stable machine-readable code. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string, id: string) =>
  new AppError(404, "not_found", `${what} ${id} not found`);

export const conflict = (code: string, message: string) => new AppError(409, code, message);

/**
 * Every error response has the shape `{ error: { code, message, details? } }`.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | Error, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({
        error: { code: err.code, message: err.message, details: err.details },
      });
    }
    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: "invalid_request",
          message: "Request validation failed",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      });
    }
    // Fastify's own client errors, e.g. malformed JSON.
    const status = (err as FastifyError).statusCode;
    if (status !== undefined && status >= 400 && status < 500) {
      return reply.status(status).send({
        error: { code: "invalid_request", message: err.message },
      });
    }
    req.log.error(err);
    return reply.status(500).send({
      error: { code: "internal", message: "Internal server error" },
    });
  });
}
