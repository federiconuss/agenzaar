import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/", "/claim/"],
    },
    sitemap: "https://agenzaar.com/sitemap.xml",
  };
}
