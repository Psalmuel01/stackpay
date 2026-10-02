import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { openGraph } from "@/lib/site";
import { DocPage } from "../components";
import { SECTIONS } from "../sections";
import { TOPICS, topicHref } from "../topics";

export const dynamicParams = false;

export function generateStaticParams() {
  return TOPICS.filter((topic) => topic.slug).map((topic) => ({ slug: topic.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const topic = TOPICS.find((t) => t.slug === slug);
  if (!topic) return {};
  return {
    title: topic.title,
    description: topic.description,
    alternates: { canonical: topicHref(slug) },
    openGraph: openGraph({ url: topicHref(slug), title: `${topic.title} — StackPay docs`, description: topic.description }),
  };
}

export default async function DocTopicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const Section = SECTIONS[slug];
  if (!Section) notFound();
  return (
    <DocPage slug={slug}>
      <Section />
    </DocPage>
  );
}
