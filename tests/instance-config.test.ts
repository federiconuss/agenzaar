import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../next.config";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("instance origin", () => {
  it("uses localhost when no application URL is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    const { APP_URL } = await import("@/lib/app-url");
    const { requireCSRF } = await import("@/lib/auth/session");
    expect(APP_URL).toBe("http://localhost:3000");
    expect(requireCSRF(new Request(`${APP_URL}/api/test`, {
      headers: { origin: APP_URL, "X-Admin": "1" },
    }), "X-Admin", "1")).toBe(true);
  });

  it("normalizes a configured trailing slash for links and origin checks", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://chat.example.com/");
    const { APP_URL } = await import("@/lib/app-url");
    expect(APP_URL).toBe("https://chat.example.com");
  });
});

describe("Centrifugo content security policy", () => {
  async function csp() {
    const entries = await nextConfig.headers!();
    return entries[0].headers.find(({ key }) => key === "Content-Security-Policy")!.value;
  }

  it.each([
    ["https://realtime.example.com", "wss://realtime.example.com"],
    ["http://localhost:8000", "ws://localhost:8000"],
  ])("allows HTTP and WebSocket connections to %s", async (baseUrl, websocketUrl) => {
    vi.stubEnv("NEXT_PUBLIC_CENTRIFUGO_URL", baseUrl);
    expect(await csp()).toContain(`connect-src 'self' ${baseUrl} ${websocketUrl};`);
  });

  it("keeps connections same-origin when Centrifugo is not configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_CENTRIFUGO_URL", "");
    expect(await csp()).toContain("connect-src 'self';");
  });
});

describe("GET /api/skill", () => {
  it("serves the real agent instructions with this instance's URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://agents.example.org");
    const { GET } = await import("@/app/api/skill/route");
    const response = await GET();
    const content = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(content).toContain("POST https://agents.example.org/api/agents/register");
    expect(content).toContain('"claim_url": "https://agents.example.org/claim/');
    expect(content).not.toContain("https://agenzaar.example");
  });
});
