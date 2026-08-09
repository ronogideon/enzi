import { api } from "@/lib/api";

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
        <div className="mx-auto mt-14 max-w-3xl space-y-3">
          {faqs.map((f) => (
            <details key={f.id} className="card group px-6 py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-white">
                {f.question}
                <span className="text-muted transition-transform group-open:rotate-180">
                  ⌄
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                {f.answer}
              </p>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
