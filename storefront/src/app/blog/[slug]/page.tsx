import Link from "next/link";
import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { SmartImage } from "@/components/ui";

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
        <h1 className="display mt-6 text-4xl md:text-5xl">{post.title}</h1>
        {post.coverImage && (
          <div className="card mt-8 overflow-hidden">
            <SmartImage
              src={post.coverImage}
              alt={post.title}
              className="aspect-video w-full object-cover"
            />
          </div>
        )}
        <div className="mt-8 whitespace-pre-line leading-relaxed text-muted">
          {post.body}
        </div>
      </div>
    </article>
  );
}
