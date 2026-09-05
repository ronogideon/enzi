"use client";

import { useState } from "react";

/** Read at runtime from window.__ENV__ (browser) or process.env (server), so
 * the number is changeable from Railway without a rebuild. */
function whatsappNumber(): string {
  if (typeof window !== "undefined" && window.__ENV__?.WHATSAPP)
    return window.__ENV__.WHATSAPP;
  return process.env.WHATSAPP ?? process.env.NEXT_PUBLIC_WHATSAPP ?? "254110050620";
}

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });

  const composed = `Hi Enzi Packaging,%0A%0AName: ${encodeURIComponent(
    form.name
  )}%0APhone: ${encodeURIComponent(form.phone)}%0AEmail: ${encodeURIComponent(
    form.email
  )}%0A%0A${encodeURIComponent(form.message)}`;

  const waHref = `https://wa.me/${whatsappNumber()}?text=${composed}`;
  const mailHref = `mailto:info@enzipackaging.co.ke?subject=${encodeURIComponent(
    "Website enquiry"
  )}&body=${composed}`;

  return (
    <div className="shell py-16">
      <div className="text-center">
        <p className="eyebrow">Get in touch</p>
        <h1 className="display mx-auto mt-3 max-w-2xl text-4xl md:text-6xl">
          Contact us
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-muted">
          Questions about products, wholesale, or a custom order? We’re here to
          help.
        </p>
      </div>

      <div className="mt-14 grid gap-10 lg:grid-cols-[1fr_1.2fr]">
        {/* info */}
        <div className="space-y-4">
          <InfoCard title="Visit us" lines={["Dynamic Mall, Suite ML135", "Tom Mboya Street, Nairobi CBD"]} />
          <InfoCard
            title="Call us"
            lines={["+254 1100-50620"]}
            href="tel:+254110050620"
          />
          <InfoCard
            title="Email us"
            lines={["info@enzipackaging.co.ke"]}
            href="mailto:info@enzipackaging.co.ke"
          />
          <a
            href={`https://wa.me/${whatsappNumber()}`}
            target="_blank"
            rel="noopener noreferrer"
            className="card card-hover flex items-center gap-4 p-5"
          >
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-whatsapp/15 text-whatsapp">
              WA
            </span>
            <div>
              <p className="font-medium text-white">Chat on WhatsApp</p>
              <p className="text-sm text-muted">Fastest way to reach us</p>
            </div>
          </a>
        </div>

        {/* form */}
        <div className="card p-8">
          <p className="font-display text-xl font-bold text-white">
            Send us a message
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <input
              className="field"
              placeholder="Your name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <input
              className="field"
              placeholder="Phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <input
              className="field sm:col-span-2"
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <textarea
              className="field min-h-32 sm:col-span-2"
              placeholder="How can we help?"
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
            />
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a href={waHref} target="_blank" rel="noopener noreferrer" className="btn-primary flex-1">
              Send via WhatsApp
            </a>
            <a href={mailHref} className="btn-ghost flex-1">
              Send via Email
            </a>
          </div>
          <p className="mt-3 text-xs text-faint">
            Your message opens in WhatsApp or your email app, pre-filled and ready
            to send.
          </p>
        </div>
      </div>
    </div>
  );
}

function InfoCard({
  title,
  lines,
  href,
}: {
  title: string;
  lines: string[];
  href?: string;
}) {
  const inner = (
    <div className="card p-5">
      <p className="eyebrow mb-2">{title}</p>
      {lines.map((l) => (
        <p key={l} className="text-cloud">
          {l}
        </p>
      ))}
    </div>
  );
  return href ? (
    <a href={href} className="block">
      {inner}
    </a>
  ) : (
    inner
  );
}
