import { config } from "../../src/config.js";
import { migrate } from "../../src/migrate.js";

export default async function setup() {
  await migrate(config.testDatabaseUrl);
}
