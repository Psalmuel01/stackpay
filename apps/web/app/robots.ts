import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// Public pages are crawlable. Private surfaces (console, checkout) carry a noindex tag instead of
// being blocked here, so search engines can see that tag and drop them.
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: new URL("/sitemap.xml", base).toString(),
    host: base.origin,
  };
}
