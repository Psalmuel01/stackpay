import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
import { TOPICS, topicHref } from "./(site)/docs/topics";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const now = new Date();
  return [
    { url: new URL("/", base).toString(), lastModified: now, changeFrequency: "weekly", priority: 1 },
    ...TOPICS.map((topic) => ({
      url: new URL(topicHref(topic.slug), base).toString(),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: topic.slug ? 0.7 : 0.8,
    })),
  ];
}
