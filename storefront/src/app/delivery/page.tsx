import type { Metadata } from "next";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatKes } from "@/lib/money";
import { Icon } from "@/components/Icons";

export const metadata: Metadata = {
  title: "Delivery information",
  description:
    "How we deliver packaging orders across Kenya — pickup, rider delivery, courier and agent options, with the charges for each area.",
};

const TYPE_COPY: Record<string, { blurb: string; icon: keyof typeof Icon }> = {
  STORE_PICKUP: {
    blurb: "Collect your order yourself from our shop during opening hours. Always free.",
    icon: "Stock",
  },
  DELIVERY: {
    blurb: "We bring the order to your door. Charges depend on how far you are.",
    icon: "Delivery",
  },
  PARCEL: {
    blurb: "Sent by courier or matatu parcel service for delivery outside our rider range.",
    icon: "Package",
  },
  PICKUP_MTAANI: {
    blurb: "Delivered to a Pickup Mtaani agent near you, for you to collect at your convenience.",
    icon: "Orders",
  },
};

/**
 * Delivery information.
 *
 * Built from the same live delivery methods and zones the checkout uses, so
 * the prices quoted here can never drift from what a customer is actually
 * charged — which is the usual failure of a hand-written delivery page.
 */
export default async function DeliveryPage() {
  const [methods, site] = await Promise.all([api.deliveryMethods(), api.siteConfig()]);
  const active = methods.filter((m) => m.active !== false);

  return (
    <div className="shell py-16">
      <div className="mx-auto max-w-3xl">
        <p className="eyebrow animate-fade">Delivery</p>
        <h1 className="display animate-rise mt-3 text-4xl md:text-5xl">
          How your order reaches you
        </h1>
        <p className="animate-rise mt-4 text-muted">
          Choose a delivery method at checkout. Charges are shown before you pay — there
          are no surprises added afterwards.
        </p>

        {active.length === 0 ? (
          <div className="card mt-12 p-8 text-center">
            <p className="text-muted">
              Delivery options are being updated. Please{" "}
              <Link href="/contact" className="text-white underline">
                contact us
              </Link>{" "}
              for current charges.
            </p>
          </div>
        ) : (
          <div className="stagger mt-12 space-y-6">
            {active.map((m) => {
              const copy = TYPE_COPY[m.type] ?? { blurb: "", icon: "Delivery" as const };
              const Glyph = Icon[copy.icon];
              const zones = (m.zones ?? [])
                .filter((z) => z.active !== false)
                .sort((a, b) => a.name.localeCompare(b.name));

              return (
                <section key={m.id} className="card p-6">
                  <div className="flex items-start gap-4">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ink-800 text-cloud">
                      <Glyph className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="font-display text-xl font-bold text-white">{m.name}</h2>
                      <p className="mt-1 text-sm text-muted">
                        {m.description || copy.blurb}
                      </p>
                      {m.podAllowed && (
                        <p className="mt-2 inline-block rounded-full border border-whatsapp/30 bg-whatsapp/10 px-2.5 py-0.5 text-xs text-whatsapp">
                          Pay on delivery available
                        </p>
                      )}
                    </div>
                  </div>

                  {zones.length > 0 ? (
                    <div className="mt-5 overflow-hidden rounded-xl border border-ink-line">
                      <table className="w-full text-sm">
                        <thead className="bg-ink-800/60">
                          <tr>
                            <th className="px-4 py-2.5 text-left font-medium text-faint">Area</th>
                            <th className="px-4 py-2.5 text-right font-medium text-faint">
                              Charge
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {zones.map((z) => (
                            <tr key={z.id} className="border-t border-ink-line/60">
                              <td className="px-4 py-2.5">
                                <span className="text-cloud">{z.name}</span>
                                {z.description && (
                                  <span className="block text-xs text-faint">
                                    {z.description}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                {z.price === 0 ? (
                                  <span className="text-whatsapp">Free</span>
                                ) : (
                                  <span className="text-white">{formatKes(z.price)}</span>
                                )}
                                {z.freeAbove != null && (
                                  <span className="block text-xs text-whatsapp">
                                    Free over {formatKes(z.freeAbove)}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="mt-5 text-sm">
                      <span className="text-faint">Charge: </span>
                      {m.baseCost === 0 ? (
                        <span className="text-whatsapp">Free</span>
                      ) : (
                        <span className="text-white">{formatKes(m.baseCost)}</span>
                      )}
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        )}

        <div className="card mt-10 p-6">
          <h2 className="font-display text-lg font-bold text-white">Good to know</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>• Delivery charges are calculated at checkout once you pick your area.</li>
            <li>• You can add delivery instructions — a building name, gate, or a second
              phone number — when you check out.</li>
            <li>• Orders are packed the same working day where possible; you'll see the
              status update in your account as we pack and dispatch.</li>
            <li>• Outside the areas listed? {" "}
              <Link href="/contact" className="text-white underline underline-offset-4">
                Talk to us
              </Link>{" "}
              and we'll arrange something.</li>
          </ul>
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/shop" className="btn-primary px-8">
            Start shopping
          </Link>
          <Link href="/faqs" className="btn-ghost px-8">
            Read the FAQs
          </Link>
        </div>

        {site.store.phone && (
          <p className="mt-8 text-sm text-faint">
            Questions about delivery? Call {site.store.phone}.
          </p>
        )}
      </div>
    </div>
  );
}
