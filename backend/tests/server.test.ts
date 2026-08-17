import assert from "node:assert/strict";
import test from "node:test";
import type { Database } from "../src/db/database.js";
import { createApp } from "../src/server.js";

const fakeDatabase = {} as Database;
const authSecret = "01234567890123456789012345678901";

test("health endpoint is public", async () => {
  const app = await createApp({ database: fakeDatabase, authSecret });
  const response = await app.inject({ method: "GET", url: "/health" });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "ok" });
  await app.close();
});

test("tenant routes require bearer authentication", async () => {
  const app = await createApp({ database: fakeDatabase, authSecret });
  const response = await app.inject({ method: "GET", url: "/v1/deployments/active" });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error, "unauthorized");
  await app.close();
});
