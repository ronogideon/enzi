import { api } from "@/lib/api";
import { renderMarkdown } from "@/lib/markdown";
import { Icon } from "@/components/Icons";

export const metadata = { title: "FAQs" };

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

      {faqs.length === 0 ? (
        <div className="card mx-auto mt-16 grid max-w-2xl place-items-center px-6 py-20 text-center">
          <p className="text-muted">No FAQs available at the moment.</p>
        </div>
      ) : (
        <div className="stagger mx-auto mt-14 max-w-3xl space-y-3">
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
