import { config } from "../src/config.js";
import { migrate } from "../src/migrate.js";

const url = process.argv.includes("--test") ? config.testDatabaseUrl : config.databaseUrl;

const ran = await migrate(url, console.log);
console.log(ran.length === 0 ? "nothing to migrate" : `${ran.length} migration(s) applied`);
