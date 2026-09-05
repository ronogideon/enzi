import Link from "next/link";
import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { SmartImage } from "@/components/ui";
import { renderMarkdown } from "@/lib/markdown";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}) {
  const post = await api.blogPost(params.slug);
  return { title: post?.title ?? "Article" };
}

export default async function BlogPostPage({
  params,
}: {
  params: { slug: string };
}) {
  const post = await api.blogPost(params.slug);
  if (!post) notFound();
  return (
    <article className="shell py-16">
      <div className="mx-auto max-w-3xl">
        <Link href="/blog" className="text-sm text-muted hover:text-cloud">
          ← All articles
        </Link>
        <h1 className="display animate-rise mt-6 text-4xl md:text-5xl">{post.title}</h1>
        {post.coverImage && (
          <div className="card mt-8 overflow-hidden">
            <SmartImage
              src={post.coverImage}
              alt={post.title}
              className="aspect-video w-full object-cover"
            />
          </div>
        )}
        {post.publishedAt && (
          <p className="mt-4 text-sm text-faint">
            {new Date(post.publishedAt).toLocaleDateString("en-KE", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        )}
        {/* Rendered from Markdown to a fixed set of tags — links are clickable
            and images inline, with no path from stored text to raw HTML. */}
        <div
          className="prose-enzi mt-10"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(post.body) }}
        />
      </div>
    </article>
  );
}
