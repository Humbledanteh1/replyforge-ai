import { createHmac, timingSafeEqual } from "node:crypto";

export type AuthTokenClaims = {
  sub: string;
  exp?: number;
  iss?: string;
  aud?: string | string[];
  workspace_id?: string;
  roles?: string[];
};

export type TokenVerifierOptions = {
  secret: string;
  issuer?: string;
  audience?: string;
  clockSkewSeconds?: number;
};

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function parseJsonObject(value: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`Invalid JWT ${label}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid JWT ${label}`);
  }

  return parsed as Record<string, unknown>;
}

function hasAudience(claim: string | string[] | undefined, expected: string): boolean {
  return Array.isArray(claim) ? claim.includes(expected) : claim === expected;
}

export function verifyBearerToken(
  authorizationHeader: string | undefined,
  options: TokenVerifierOptions,
): AuthTokenClaims {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    throw new Error("Bearer authentication is required");
  }

  const token = authorizationHeader.slice("Bearer ".length).trim();
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed bearer token");

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new Error("Malformed bearer token");
  }
  const header = parseJsonObject(decodeBase64Url(encodedHeader), "header");
  const payload = parseJsonObject(decodeBase64Url(encodedPayload), "payload");

  if (header.alg !== "HS256" || header.typ !== "JWT") {
    throw new Error("Unsupported bearer token algorithm");
  }

  const expectedSignature = createHmac("sha256", options.secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  const actualSignature = Buffer.from(encodedSignature, "base64url");
  if (
    actualSignature.length !== expectedSignature.length
    || !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    throw new Error("Invalid bearer token signature");
  }

  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new Error("Bearer token subject is required");
  }

  const now = Math.floor(Date.now() / 1000);
  const clockSkew = options.clockSkewSeconds ?? 30;
  if (typeof payload.exp === "number" && payload.exp < now - clockSkew) {
    throw new Error("Bearer token has expired");
  }
  if (options.issuer && payload.iss !== options.issuer) {
    throw new Error("Bearer token issuer is invalid");
  }
  if (options.audience && !hasAudience(payload.aud as string | string[] | undefined, options.audience)) {
    throw new Error("Bearer token audience is invalid");
  }

  return {
    sub: payload.sub,
    ...(typeof payload.exp === "number" ? { exp: payload.exp } : {}),
    ...(typeof payload.iss === "string" ? { iss: payload.iss } : {}),
    ...(typeof payload.aud === "string" || Array.isArray(payload.aud) ? { aud: payload.aud as string | string[] } : {}),
    ...(typeof payload.workspace_id === "string" ? { workspace_id: payload.workspace_id } : {}),
    ...(Array.isArray(payload.roles) && payload.roles.every((role) => typeof role === "string")
      ? { roles: payload.roles as string[] }
      : {}),
  };
}
