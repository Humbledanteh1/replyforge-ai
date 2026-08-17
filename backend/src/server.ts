import Fastify from "fastify";
import { createDatabase, type Database } from "./db/database.js";
import { registerApiRoutes } from "./http/routes.js";

export type ServerOptions = {
  database?: Database;
  authSecret?: string;
  authIssuer?: string;
  authAudience?: string;
};

function requiredSecret(secret = process.env.AUTH_JWT_SECRET): string {
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_JWT_SECRET must be set and at least 32 characters long");
  }
  return secret;
}

export async function createApp(options: ServerOptions = {}) {
  const database = options.database ?? createDatabase();
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
    requestIdHeader: "x-request-id",
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "request failed");
    const message = error instanceof Error ? error.message : "Request failed";
    const isClientError = /required|invalid|must be|Malformed|not sendable/i.test(message);
    return reply.code(isClientError ? 400 : 500).send({
      error: isClientError ? "bad_request" : "internal_error",
      message: isClientError ? message : "An unexpected error occurred",
    });
  });

  await registerApiRoutes(app, {
    database,
    auth: {
      secret: requiredSecret(options.authSecret),
      ...((options.authIssuer ?? process.env.AUTH_JWT_ISSUER)
        ? { issuer: options.authIssuer ?? process.env.AUTH_JWT_ISSUER! }
        : {}),
      ...((options.authAudience ?? process.env.AUTH_JWT_AUDIENCE)
        ? { audience: options.authAudience ?? process.env.AUTH_JWT_AUDIENCE! }
        : {}),
    },
  });

  return app;
}

async function start(): Promise<void> {
  const app = await createApp();
  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  const host = process.env.HOST ?? "0.0.0.0";
  await app.listen({ port, host });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  start().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
