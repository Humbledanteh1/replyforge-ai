import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { verifyBearerToken } from "../src/auth/token.js";

const secret = "01234567890123456789012345678901";

function makeToken(payload: Record<string, unknown>, signingSecret = secret): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "HS256", typ: "JWT" });
  const body = encode(payload);
  const signature = createHmac("sha256", signingSecret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

test("accepts a valid signed bearer token", () => {
  const token = makeToken({
    sub: "00000000-0000-4000-8000-000000000001",
    workspace_id: "00000000-0000-4000-8000-000000000002",
    exp: Math.floor(Date.now() / 1000) + 300,
    iss: "replyforge-auth",
    aud: "replyforge-api",
  });

  const claims = verifyBearerToken(`Bearer ${token}`, {
    secret,
    issuer: "replyforge-auth",
    audience: "replyforge-api",
  });

  assert.equal(claims.sub, "00000000-0000-4000-8000-000000000001");
  assert.equal(claims.workspace_id, "00000000-0000-4000-8000-000000000002");
});

test("rejects an expired token", () => {
  const token = makeToken({
    sub: "00000000-0000-4000-8000-000000000001",
    exp: Math.floor(Date.now() / 1000) - 60,
  });

  assert.throws(
    () => verifyBearerToken(`Bearer ${token}`, { secret }),
    /expired/,
  );
});

test("rejects a token with a tampered signature", () => {
  const token = makeToken({ sub: "00000000-0000-4000-8000-000000000001" }, "wrong-secret");

  assert.throws(
    () => verifyBearerToken(`Bearer ${token}`, { secret }),
    /signature/,
  );
});

test("rejects a token without a bearer scheme", () => {
  assert.throws(
    () => verifyBearerToken("Basic abc", { secret }),
    /Bearer authentication is required/,
  );
});
