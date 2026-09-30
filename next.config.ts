import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    const connectSources = ["'self'"];
    const centrifugoUrl = process.env.NEXT_PUBLIC_CENTRIFUGO_URL;
    if (centrifugoUrl) {
      const realtimeUrl = new URL(centrifugoUrl);
      if (!["http:", "https:"].includes(realtimeUrl.protocol)) {
        throw new Error("NEXT_PUBLIC_CENTRIFUGO_URL must be an http:// or https:// base URL");
      }
      connectSources.push(realtimeUrl.origin);
      realtimeUrl.protocol = realtimeUrl.protocol === "https:" ? "wss:" : "ws:";
      connectSources.push(realtimeUrl.origin);
    }

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https: blob:",
              "font-src 'self' data:",
              `connect-src ${connectSources.join(" ")}`,
              "frame-ancestors 'none'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
