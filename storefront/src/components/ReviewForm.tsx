"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";

export function ReviewForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [form, setForm] = useState({ authorName: "", body: "" });
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function submit() {
    if (!form.authorName.trim() || !form.body.trim()) return;
    setState("sending");
    try {
      await api.submitReview({ ...form, rating });
      setState("done");
      setForm({ authorName: "", body: "" });
      setTimeout(() => {
        setOpen(false);
        setState("idle");
        router.refresh();
      }, 1500);
    } catch {
      setState("error");
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-ghost">
        Write a review
      </button>
    );
  }

  return (
    <div className="card w-full max-w-md p-6">
      <p className="font-display text-lg font-bold text-white">Write a review</p>
      {state === "done" ? (
        <p className="mt-4 text-sm text-whatsapp">
          Thanks! Your review will appear once approved.
        </p>
      ) : (
        <>
          <div className="mt-4 flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setRating(n)}
                className="text-2xl"
                style={{ color: n <= rating ? "#F5C518" : "rgba(255,255,255,0.25)" }}
                aria-label={`${n} stars`}
              >
                ★
              </button>
            ))}
          </div>
          <input
            className="field mt-4"
            placeholder="Your name"
            value={form.authorName}
            onChange={(e) => setForm({ ...form, authorName: e.target.value })}
          />
          <textarea
            className="field mt-3 min-h-24"
            placeholder="Share your experience"
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
          />
          {state === "error" && (
            <p className="mt-2 text-sm text-red-400">Couldn’t submit. Try again.</p>
          )}
          <div className="mt-4 flex gap-3">
            <button onClick={submit} disabled={state === "sending"} className="btn-primary flex-1">
              {state === "sending" ? "Sending…" : "Submit review"}
            </button>
            <button onClick={() => setOpen(false)} className="btn-ghost">
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
