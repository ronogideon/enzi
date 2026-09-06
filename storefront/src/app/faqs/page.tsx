import Link from "next/link";
import { api } from "@/lib/api";
import { renderMarkdown } from "@/lib/markdown";
import { Icon } from "@/components/Icons";

export const metadata = {
  title: "FAQs",
  description:
    "Answers to common questions about ordering packaging from Enzi Packaging — delivery, payment, minimum quantities and wholesale pricing.",
};

export default async function FaqsPage() {
  const faqs = await api.faqs();
  return (
    <div className="shell py-16">
      <div className="text-center">
        <p className="eyebrow">Support</p>
        <h1 className="display mx-auto mt-3 max-w-3xl text-4xl md:text-6xl">
          Frequently asked questions
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-muted">
          Everything you need to know about our packaging solutions, shipping,
          and wholesale options.
        </p>
      </div>

        <div className="mx-auto mt-10 max-w-3xl">
          <Link
            href="/delivery"
            className="card lift flex items-center gap-4 p-5 hover:border-white/20"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ink-800 text-cloud">
              <Icon.Delivery className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-white">Delivery methods &amp; charges</span>
              <span className="block text-sm text-muted">
                See every delivery option and what it costs for your area.
              </span>
            </span>
            <Icon.ArrowRight className="h-5 w-5 shrink-0 text-faint" />
          </Link>
        </div>

      {faqs.length === 0 ? (
        <div className="card mx-auto mt-16 grid max-w-2xl place-items-center px-6 py-20 text-center">
          <p className="text-muted">No FAQs available at the moment.</p>
        </div>
      ) : (
        <div className="stagger mx-auto mt-8 max-w-3xl space-y-3">
          {faqs.map((f) => (
            <details key={f.id} className="card group px-6 py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-white">
                {f.question}
                <Icon.ChevronDown className="h-4 w-4 shrink-0 text-muted transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <div
                className="prose-enzi mt-3 text-sm"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(f.answer) }}
              />
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
