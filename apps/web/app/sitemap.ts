import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const now = new Date();
  return [
    { url: new URL("/", base).toString(), lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: new URL("/docs", base).toString(), lastModified: now, changeFrequency: "weekly", priority: 0.8 },
  ];
}
