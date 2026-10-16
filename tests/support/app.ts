import { afterAll } from "vitest";
import { buildApp } from "../../src/app.js";
import { testDb } from "./db.js";

type App = ReturnType<typeof buildApp>;

/** Builds the app against the test database; closed after the file's tests. */
export function testApp(): App {
  const app = buildApp({ db: testDb });
  afterAll(() => app.close());
  return app;
}

/** Creates a group and its members through the API. Returns member ids by name. */
export async function seedGroup(
  app: App,
  names: string[],
): Promise<{ groupId: string; ids: Record<string, string> }> {
  const post = async (url: string, payload: object) => {
    const res = await app.inject({ method: "POST", url, payload });
    if (res.statusCode !== 201) throw new Error(`${url}: ${res.statusCode} ${res.body}`);
    return res.json();
  };
  const { id: groupId } = await post("/groups", { name: "Trip" });
  const ids: Record<string, string> = {};
  for (const name of names) {
    const { id } = await post("/members", { name });
    await post(`/groups/${groupId}/members`, { memberId: id });
    ids[name] = id;
  }
  return { groupId, ids };
}
