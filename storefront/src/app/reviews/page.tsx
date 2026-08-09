import { api } from "@/lib/api";
import { StarRating } from "@/components/ui";
import { ReviewForm } from "@/components/ReviewForm";

export const metadata = { title: "Reviews" };

export default async function ReviewsPage() {
  const reviews = await api.reviews();
  const count = reviews.length;
  const avg =
    count > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / count : 0;

  const dist = [5, 4, 3, 2, 1].map((star) => {
    const n = reviews.filter((r) => r.rating === star).length;
    return { star, pct: count ? Math.round((n / count) * 100) : 0 };
  });

  return (
    <div className="shell py-16">
      <div className="grid gap-12 border-b border-ink-line pb-14 md:grid-cols-2">
        <div>
          <p className="eyebrow">Average rating</p>
          <p className="display mt-3 text-7xl">{avg.toFixed(1)}</p>
          <div className="mt-3">
            <StarRating value={avg} size={22} />
          </div>
          <p className="mt-3 text-sm text-muted">
            Based on {count} verified review{count === 1 ? "" : "s"}
          </p>
        </div>
        <div className="space-y-3">
          {dist.map((d) => (
            <div key={d.star} className="flex items-center gap-3 text-sm">
              <span className="w-14 text-muted">{d.star} stars</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-hover">
                <div className="h-full bg-white" style={{ width: `${d.pct}%` }} />
              </div>
              <span className="w-10 text-right text-faint">{d.pct}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between py-8">
        <h2 className="display text-2xl">All reviews ({count})</h2>
        <ReviewForm />
      </div>

      {count === 0 ? (
        <div className="card grid place-items-center px-6 py-20 text-center">
          <p className="text-muted">No reviews yet. Be the first to leave one.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {reviews.map((r) => (
            <figure key={r.id} className="card p-6">
              <div className="flex items-center justify-between">
                <figcaption className="font-display font-bold text-white">
                  {r.authorName}
                </figcaption>
                <StarRating value={r.rating} />
              </div>
              <blockquote className="mt-3 leading-relaxed text-muted">
                “{r.body}”
              </blockquote>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
