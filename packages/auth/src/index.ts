import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Database } from "../../db/src";
import { authSchema } from "../../db/src/schema";

export function createAuth(
  db: Database,
  options: {
    secret: string;
    appUrl: string;
    sendVerification: (message: {
      userId: string;
      email: string;
      url: string;
    }) => Promise<void>;
  },
) {
  const socialProviders: Record<
    string,
    { clientId: string; clientSecret: string }
  > = {};
  for (const name of ["github", "google"]) {
    const prefix = name.toUpperCase();
    if (
      process.env[`${prefix}_CLIENT_ID`] &&
      process.env[`${prefix}_CLIENT_SECRET`]
    )
      socialProviders[name] = {
        clientId: process.env[`${prefix}_CLIENT_ID`]!,
        clientSecret: process.env[`${prefix}_CLIENT_SECRET`]!,
      };
  }
  return betterAuth({
    secret: options.secret,
    baseURL: options.appUrl,
    trustedOrigins: [options.appUrl],
    database: drizzleAdapter(db.orm, { provider: "pg", schema: authSchema }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) =>
        options.sendVerification({ userId: user.id, email: user.email, url }),
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
    },
    socialProviders,
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    rateLimit: { enabled: true, window: 60, max: 15 },
    advanced: { useSecureCookies: options.appUrl.startsWith("https://") },
    logger: { disabled: true },
  });
}
