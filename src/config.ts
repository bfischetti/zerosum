// Defaults match docker-compose.yml, so local dev and tests need no .env.
export const config = {
  databaseUrl:
    process.env.DATABASE_URL ?? "postgres://zerosum:zerosum@localhost:5433/zerosum",
  testDatabaseUrl:
    process.env.TEST_DATABASE_URL ??
    "postgres://zerosum:zerosum@localhost:5433/zerosum_test",
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? "127.0.0.1",
};
