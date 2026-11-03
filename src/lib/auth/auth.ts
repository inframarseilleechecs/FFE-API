/**
 * Moteur d'authentification Better-Auth pour Marseille-Échecs v1.2
 * Gère les sessions persistées en PostgreSQL, Email/Password et Google OAuth.
 * Auteur : Sergey CHUKHNO
 */

import { betterAuth } from "better-auth";
import { getDbPool } from "../db/client";

const pool = getDbPool();

export const auth = betterAuth({
  database: pool || (process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : undefined),
  baseURL:
    process.env.BETTER_AUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"),
  trustedOrigins: [
    "https://ffe-api.vercel.app",
    "https://*.vercel.app",
    "http://localhost:3000",
    "http://localhost:3002",
    ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
  ],
  secret: process.env.BETTER_AUTH_SECRET || "recupffe_fallback_secret_key_at_least_32_chars_2026",
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  socialProviders: {
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "coach",
        required: true,
      },
      phone: {
        type: "string",
        required: false,
      },
    },
  },
  advanced: {
    cookiePrefix: "recupffe",
    useSecureCookies: process.env.NODE_ENV === "production",
  },
});

export type Session = typeof auth.$Infer.Session;
