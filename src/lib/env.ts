import "server-only";

import { z } from "zod";

/**
 * Server-side environment contract. Imported only from server code — never from a
 * Client Component, or the schema (and any secret in it) would be bundled for the
 * browser. Validated once at module load so a misconfigured deployment fails fast
 * and loudly instead of throwing a confusing driver error on the first request.
 */
const envSchema = z
  .object({
    MONGODB_URI: z
      .string()
      .min(1, "MONGODB_URI is required")
      .refine(
        (value) => value.startsWith("mongodb://") || value.startsWith("mongodb+srv://"),
        "MONGODB_URI must start with mongodb:// or mongodb+srv://",
      ),
    MONGODB_DB_NAME: z.string().min(1).optional(),
    /**
     * HMAC key for the doctor-portal cookie. Generate with:
     *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
     */
    PORTAL_SESSION_SECRET: z.string().min(32, "PORTAL_SESSION_SECRET must be >= 32 chars"),
    /** Absolute origin used to build the QR code target URL. */
    APP_URL: z.url().default("http://localhost:3000"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    /* --- notifications --- */
    // Defaults to "stub" so the app runs end to end before Meta approves a template.
    NOTIFY_PROVIDER: z.enum(["stub", "meta"]).default("stub"),
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
    WHATSAPP_ACCESS_TOKEN: z.string().optional(),
    WHATSAPP_TEMPLATE_NAME: z.string().default("queue_almost_your_turn"),
    WHATSAPP_TEMPLATE_LANG: z.string().default("en"),
    WHATSAPP_API_VERSION: z.string().default("v21.0"),

    /* --- rate limiting --- */
    // When both are set the limiter becomes shared across instances. Without them it
    // falls back to per-instance memory, which is advisory only.
    UPSTASH_REDIS_REST_URL: z.string().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

    /* --- operations --- */
    // Shared secret for the scheduled reclaim endpoint. Vercel Cron sends it as a
    // bearer token; without it the route is disabled rather than left open.
    CRON_SECRET: z.string().min(16).optional(),

    /* --- payments --- */
    PAYMENT_PROVIDER: z.enum(["stub", "razorpay"]).default("stub"),
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    // Selecting a real provider without its credentials would fail silently at the
    // first patient notification, which is the worst possible time to find out.
    if (value.NOTIFY_PROVIDER === "meta") {
      if (!value.WHATSAPP_PHONE_NUMBER_ID || !value.WHATSAPP_ACCESS_TOKEN) {
        ctx.addIssue({
          code: "custom",
          path: ["NOTIFY_PROVIDER"],
          message:
            "NOTIFY_PROVIDER=meta requires WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN.",
        });
      }
    }
    if (value.PAYMENT_PROVIDER === "razorpay") {
      if (!value.RAZORPAY_KEY_ID || !value.RAZORPAY_KEY_SECRET) {
        ctx.addIssue({
          code: "custom",
          path: ["PAYMENT_PROVIDER"],
          message: "PAYMENT_PROVIDER=razorpay requires RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${details}\n\nSee .env.example.`);
  }

  return parsed.data;
}

export const env = loadEnv();
