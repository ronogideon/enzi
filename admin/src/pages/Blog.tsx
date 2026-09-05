import { useRef, useState } from "react";
import { api, mediaUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { renderMarkdown, excerptFrom } from "@/lib/markdown";
import type { BlogPost } from "@/lib/types";
import { PageHeader, Spinner, EmptyState, Badge, useAsync } from "@/components/ui";
import { Icon } from "@/components/Icons";

/**
 * Blog admin.
 *
 * The editor writes Markdown rather than HTML. That keeps links clickable and
 * images inline exactly as asked, while making it impossible for a post to
 * inject script into the storefront — the renderer escapes everything first and
 * only emits a fixed set of tags.
 *
 * Nobody has to learn the syntax: the toolbar inserts it, and a live preview
 * sits beside the text showing precisely what visitors will see.
 */
export default function Blog() {
  const { can } = useAuth();
  const posts = useAsync(() => api.blogPosts(), []);
  const [editing, setEditing] = useState<BlogPost | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      posts.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work");
    } finally {
      setBusyId(null);
    }
  }

  function remove(post: BlogPost) {
    if (!confirm(`Delete "${post.title}"? This can't be undone.`)) return;
    run(post.id, () => api.deleteBlogPost(post.id));
  }

  const list = posts.data ?? [];

  return (
    <>
      <PageHeader
        title="Blog"
        subtitle="Write posts, add photos and links, publish when you're ready"
        action={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Icon.Plus className="h-4 w-4" />
            New post
          </button>
        }
      />

      {error && (
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          <Icon.Alert className="mt-0.5 h-4 w-4" />
          {error}
        </div>
      )}

      {posts.loading ? (
        <Spinner />
      ) : posts.error ? (
        <EmptyState title="Couldn't load posts" hint={posts.error} />
      ) : list.length === 0 ? (
        <EmptyState
          title="No posts yet"
          hint="Write your first post — packaging tips, new arrivals, anything your customers would find useful."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((post) => (
            <div
              key={post.id}
              className={`card flex flex-col overflow-hidden transition-opacity ${
                busyId === post.id ? "opacity-50" : ""
              }`}
            >
              {post.coverImage ? (
                <img
                  src={mediaUrl(post.coverImage)}
                  alt=""
                  className="h-32 w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="grid h-32 w-full place-items-center bg-ink-800">
                  <Icon.Blog className="h-7 w-7 text-faint" />
                </div>
              )}

              <div className="flex flex-1 flex-col p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Badge tone={post.published ? "green" : "muted"}>
                    {post.published ? "published" : "draft"}
                  </Badge>
                  <span className="text-xs text-faint">
                    {post.publishedAt
                      ? new Date(post.publishedAt).toLocaleDateString()
                      : new Date(post.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <p className="font-medium leading-snug text-white">{post.title}</p>
                <p className="mt-1 line-clamp-2 flex-1 text-xs text-muted">
                  {post.excerpt || excerptFrom(post.body, 100)}
                </p>

                <div className="mt-4 flex gap-2 border-t border-ink-line pt-3">
                  <button className="btn-ghost flex-1 text-xs" onClick={() => setEditing(post)}>
                    <Icon.Edit className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    className="btn-ghost text-xs"
                    onClick={() =>
                      run(post.id, () =>
                        api.updateBlogPost(post.id, { published: !post.published })
                      )
                    }
                  >
                    {post.published ? "Unpublish" : "Publish"}
                  </button>
                  {can(["SUPERADMIN", "ADMIN"]) && (
                    <button
                      className="btn-danger px-2.5 text-xs"
                      onClick={() => remove(post)}
                      aria-label={`Delete ${post.title}`}
                    >
                      <Icon.Trash className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <PostEditor
          post={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            posts.reload();
          }}
        />
      )}
    </>
  );
}

/** Shrink photos in the browser before upload, same as the product uploader. */
async function downscale(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`${file.name} isn't a readable image`));
      el.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser blocked image processing");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL(file.type === "image/png" ? "image/png" : "image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function PostEditor({
  post,
  onClose,
  onSaved,
}: {
  post: BlogPost | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(post?.title ?? "");
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
  const [body, setBody] = useState(post?.body ?? "");
  const [coverImage, setCoverImage] = useState(post?.coverImage ?? "");
  const [published, setPublished] = useState(post?.published ?? false);

  const [tab, setTab] = useState<"write" | "preview">("write");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  /**
   * Wrap or insert at the caret and put the cursor somewhere sensible
   * afterwards — a toolbar that dumps syntax at the end and loses your place is
   * worse than typing it by hand.
   */
  function surround(before: string, after = "", placeholder = "") {
    const el = bodyRef.current;
    if (!el) return;
    const { selectionStart: start, selectionEnd: end } = el;
    const selected = body.slice(start, end) || placeholder;
    const next = body.slice(0, start) + before + selected + after + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }

  function insertBlock(text: string) {
    const el = bodyRef.current;
    if (!el) {
      setBody((b) => `${b}\n\n${text}\n`);
      return;
    }
    const start = el.selectionStart;
    const needsBreak = start > 0 && body[start - 1] !== "\n";
    const block = `${needsBreak ? "\n\n" : ""}${text}\n`;
    const next = body.slice(0, start) + block + body.slice(start);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + block.length;
      el.setSelectionRange(pos, pos);
    });
  }

  async function uploadInline(file: File) {
    setUploading(true);
    setError(null);
    try {
      const data = await downscale(file);
      const asset = await api.uploadImage({ filename: file.name, data });
      insertBlock(`![${file.name.replace(/\.[^.]+$/, "")}](${asset.url})`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (imageInput.current) imageInput.current.value = "";
    }
  }

  async function uploadCover(file: File) {
    setUploading(true);
    setError(null);
    try {
      const data = await downscale(file);
      const asset = await api.uploadImage({ filename: file.name, data });
      setCoverImage(asset.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (coverInput.current) coverInput.current.value = "";
    }
  }

  function addLink() {
    const url = prompt("Link address (https://…)");
    if (!url) return;
    const el = bodyRef.current;
    const selected = el ? body.slice(el.selectionStart, el.selectionEnd) : "";
    surround("[", `](${url.trim()})`, selected || "link text");
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        title: title.trim(),
        // An empty excerpt would show a blank card on the blog index, so fall
        // back to the opening lines of the post itself.
        excerpt: excerpt.trim() || excerptFrom(body),
        body,
        coverImage: coverImage || null,
        published,
      };
      if (post) await api.updateBlogPost(post.id, payload);
      else await api.createBlogPost(payload);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the post");
    } finally {
      setBusy(false);
    }
  }

  const valid = title.trim().length > 1 && body.trim().length > 0;

  const toolbar: { label: string; title: string; icon?: keyof typeof Icon; run: () => void }[] = [
    { label: "H2", title: "Heading", run: () => insertBlock("## Heading") },
    { label: "B", title: "Bold", run: () => surround("**", "**", "bold text") },
    { label: "I", title: "Italic", run: () => surround("*", "*", "italic text") },
    { label: "Link", title: "Insert link", icon: "Link", run: addLink },
    { label: "Image", title: "Upload image", icon: "Image", run: () => imageInput.current?.click() },
    { label: "List", title: "Bullet list", run: () => insertBlock("- First item") },
    { label: "Quote", title: "Quote", run: () => insertBlock("> Quoted text") },
  ];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink">
      {/* Full-screen rather than a dialog: writing a post in a 500px modal is
          miserable, and this is the one admin task that needs room. */}
      <header className="flex items-center justify-between gap-3 border-b border-ink-line px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-ink-hover hover:text-cloud"
            aria-label="Close editor"
          >
            <Icon.Close className="h-4 w-4" />
          </button>
          <p className="truncate font-display font-bold text-white">
            {post ? "Edit post" : "New post"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="hidden items-center gap-2 text-xs text-muted sm:flex">
            <input
              type="checkbox"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
              className="accent-white"
            />
            Published
          </label>
          <button className="btn-primary" onClick={save} disabled={busy || !valid}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              <Icon.Alert className="mt-0.5 h-4 w-4" />
              {error}
            </div>
          )}

          <input
            className="field mb-4 !text-xl !font-semibold"
            placeholder="Post title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <div className="mb-4 grid gap-4 sm:grid-cols-[1fr_auto]">
            <div>
              <label className="label">Short summary (optional)</label>
              <input
                className="field"
                placeholder="Shown on the blog list — left blank, we'll use your opening lines"
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Cover photo</label>
              <div className="flex items-center gap-3">
                {coverImage && (
                  <img
                    src={mediaUrl(coverImage)}
                    alt=""
                    className="h-11 w-16 rounded-lg border border-ink-line object-cover"
                  />
                )}
                <button
                  className="btn-ghost text-xs"
                  onClick={() => coverInput.current?.click()}
                  disabled={uploading}
                >
                  <Icon.Image className="h-4 w-4" />
                  {coverImage ? "Replace" : "Upload"}
                </button>
                {coverImage && (
                  <button
                    className="text-xs text-muted hover:text-danger"
                    onClick={() => setCoverImage("")}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Toolbar + write/preview switch */}
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-t-xl border border-ink-line bg-ink-800/60 px-2 py-2">
            {toolbar.map((t) => {
              const Glyph = t.icon ? Icon[t.icon] : null;
              return (
                <button
                  key={t.label}
                  type="button"
                  title={t.title}
                  onClick={t.run}
                  disabled={uploading}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-ink-hover hover:text-cloud disabled:opacity-50"
                >
                  {Glyph && <Glyph className="h-3.5 w-3.5" />}
                  {t.label}
                </button>
              );
            })}
            {uploading && (
              <span className="ml-1 h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo border-t-transparent" />
            )}

            <div className="ml-auto flex rounded-lg border border-ink-line p-0.5 text-xs">
              {(["write", "preview"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-md px-3 py-1 capitalize transition-colors ${
                    tab === t ? "bg-ink-hover text-white" : "text-muted"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <input
            ref={imageInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && uploadInline(e.target.files[0])}
          />
          <input
            ref={coverInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && uploadCover(e.target.files[0])}
          />

          {/* Side by side on wide screens; tabbed on narrow ones. */}
          <div className="grid gap-4 lg:grid-cols-2">
            <textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={"Write your post here.\n\nSelect text and use the buttons above, or type Markdown directly:\n\n## A heading\n**bold**, *italic*, [a link](https://example.com)\n\n- a bullet"}
              className={`field min-h-[52vh] resize-y font-mono text-sm leading-relaxed ${
                tab === "write" ? "" : "hidden lg:block"
              }`}
            />
            <div
              className={`card min-h-[52vh] overflow-y-auto p-6 ${
                tab === "preview" ? "" : "hidden lg:block"
              }`}
            >
              {body.trim() ? (
                <article
                  className="prose-enzi"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(body, mediaUrl) }}
                />
              ) : (
                <p className="text-sm text-faint">
                  Your post will appear here as you type, exactly as customers will see it.
                </p>
              )}
            </div>
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm text-muted sm:hidden">
            <input
              type="checkbox"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
              className="accent-white"
            />
            Published
          </label>
        </div>
      </div>
    </div>
  );
}
