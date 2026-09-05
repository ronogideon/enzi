import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { renderMarkdown } from "@/lib/markdown";
import type { Faq } from "@/lib/types";
import { PageHeader, Spinner, EmptyState, Toggle, useAsync } from "@/components/ui";
import { Icon } from "@/components/Icons";

/**
 * FAQ admin.
 *
 * Editing happens in place rather than in a dialog: these are two short fields,
 * and opening a modal to change a sentence is more ceremony than the task
 * deserves. Order is controlled with up/down buttons — reliable on touch, where
 * drag-and-drop fights with page scrolling.
 *
 * Answers accept the same Markdown as blog posts, so support answers can link
 * to a product or a delivery page instead of describing where to find it.
 */
export default function Faqs() {
  const faqs = useAsync(() => api.faqsAll(), []);
  const [items, setItems] = useState<Faq[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);

  useEffect(() => {
    if (faqs.data) setItems(faqs.data);
  }, [faqs.data]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      faqs.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work");
    }
  }

  /**
   * Reorder optimistically so the list moves the instant it's clicked, then
   * persist. On failure we reload, which snaps back to the server's truth.
   */
  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;

    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);

    setSavingOrder(true);
    try {
      await api.reorderFaqs(next.map((f) => f.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the new order");
      faqs.reload();
    } finally {
      setSavingOrder(false);
    }
  }

  function remove(faq: Faq) {
    if (!confirm(`Delete "${faq.question}"?`)) return;
    run(() => api.deleteFaq(faq.id));
  }

  return (
    <>
      <PageHeader
        title="FAQs"
        subtitle="Questions and answers shown on your shop's help page"
        action={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Icon.Plus className="h-4 w-4" />
            Add question
          </button>
        }
      />

      {error && (
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          <Icon.Alert className="mt-0.5 h-4 w-4" />
          {error}
        </div>
      )}

      {creating && (
        <FaqForm
          onCancel={() => setCreating(false)}
          onSave={async (values) => {
            await run(() => api.createFaq(values));
            setCreating(false);
          }}
        />
      )}

      {faqs.loading ? (
        <Spinner />
      ) : faqs.error ? (
        <EmptyState title="Couldn't load FAQs" hint={faqs.error} />
      ) : items.length === 0 && !creating ? (
        <EmptyState
          title="No questions yet"
          hint="Add the things customers ask most — delivery times, minimum orders, payment methods."
        />
      ) : (
        <div className={`space-y-3 ${savingOrder ? "opacity-70" : ""}`}>
          {items.map((faq, i) =>
            editingId === faq.id ? (
              <FaqForm
                key={faq.id}
                faq={faq}
                onCancel={() => setEditingId(null)}
                onSave={async (values) => {
                  await run(() => api.updateFaq(faq.id, values));
                  setEditingId(null);
                }}
              />
            ) : (
              <div key={faq.id} className="card p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  {/* Order controls, kept out of the way but always reachable */}
                  <div className="flex shrink-0 flex-col">
                    <button
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      className="grid h-7 w-7 place-items-center rounded-md text-muted transition-colors hover:bg-ink-hover hover:text-cloud disabled:opacity-25"
                      aria-label="Move up"
                    >
                      <Icon.ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => move(i, 1)}
                      disabled={i === items.length - 1}
                      className="grid h-7 w-7 place-items-center rounded-md text-muted transition-colors hover:bg-ink-hover hover:text-cloud disabled:opacity-25"
                      aria-label="Move down"
                    >
                      <Icon.ChevronDown className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-white">{faq.question}</p>
                    <div
                      className="prose-enzi mt-2 text-sm"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(faq.answer) }}
                    />
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Toggle
                      checked={faq.active}
                      onChange={(v) => run(() => api.updateFaq(faq.id, { active: v }))}
                      label="Visible on the shop"
                    />
                  </div>
                </div>

                <div className="mt-3 flex justify-end gap-2 border-t border-ink-line pt-3">
                  <button className="btn-ghost text-xs" onClick={() => setEditingId(faq.id)}>
                    <Icon.Edit className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    className="btn-danger px-2.5 text-xs"
                    onClick={() => remove(faq)}
                    aria-label={`Delete ${faq.question}`}
                  >
                    <Icon.Trash className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}

      <p className="mt-6 text-xs text-faint">
        Answers support the same formatting as blog posts — <code>**bold**</code>,{" "}
        <code>*italic*</code> and <code>[link text](https://…)</code> all work, so you can
        point people straight at a product or the delivery page.
      </p>
    </>
  );
}

function FaqForm({
  faq,
  onSave,
  onCancel,
}: {
  faq?: Faq;
  onSave: (values: { question: string; answer: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [question, setQuestion] = useState(faq?.question ?? "");
  const [answer, setAnswer] = useState(faq?.answer ?? "");
  const [busy, setBusy] = useState(false);

  const valid = question.trim().length > 2 && answer.trim().length > 0;

  async function submit() {
    setBusy(true);
    try {
      await onSave({ question: question.trim(), answer: answer.trim() });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mb-3 border-indigo/40 p-4 sm:p-5">
      <div className="space-y-3">
        <div>
          <label className="label">Question</label>
          <input
            className="field"
            value={question}
            autoFocus
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Do you deliver outside Nairobi?"
          />
        </div>
        <div>
          <label className="label">Answer</label>
          <textarea
            className="field min-h-24"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Yes — we send parcels countrywide by courier. See [delivery options](/delivery)."
          />
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost text-sm" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn-primary text-sm" onClick={submit} disabled={busy || !valid}>
          {busy ? "Saving…" : faq ? "Save changes" : "Add question"}
        </button>
      </div>
    </div>
  );
}
