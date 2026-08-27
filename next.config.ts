import type { NextConfig } from "next";

/**
 * Baseline security headers. These pages carry patient names, ages and mobile numbers,
 * so referrer leakage and framing both matter.
 *
 * No Content-Security-Policy yet: Next injects inline scripts for hydration, so a
 * useful CSP needs nonce plumbing through the middleware. Adding a permissive one that
 * allows 'unsafe-inline' would be worse than none — it reads as protection without
 * providing any.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // Send only the origin cross-site: a full patient status URL is a bearer token.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // Patient and portal pages must never be cached by an intermediary.
        source: "/:path(t|s|c)/:rest*",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
