import type { AuthContext } from "../middleware/auth";

/**
 * Hono app environment type — definește variabilele de context
 * setate de middleware-uri (auth, provider, etc).
 *
 * Folosit ca: `new Hono<AppEnv>()`
 */
export type AppEnv = {
  Variables: {
    auth: AuthContext;
    providerId: string;
  };
};
