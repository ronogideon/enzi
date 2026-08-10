import { useState } from "react";
import { api } from "@/lib/api";
import type { SmsCampaign } from "@/lib/types";
import {
  PageHeader, Spinner, EmptyState, Badge, Toggle, useAsync,
} from "@/components/ui";

export default function Sms() {
  const campaigns = useAsync(() => api.smsCampaigns(), []);

  // segment
  const [tags, setTags] = useState("");
  const [hasOrdered, setHasOrdered] = useState(false);
  const [lastDays, setLastDays] = useState("");
  const [consentOnly, setConsentOnly] = useState(true);
  const [preview, setPreview] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // campaign
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // single
  const [phone, setPhone] = useState("");
  const [singleBody, setSingleBody] = useState("");
  const [singleStatus, setSingleStatus] = useState<string | null>(null);

  function segment() {
    return {
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      hasOrdered: hasOrdered || undefined,
      lastOrderWithinDays: lastDays ? Number(lastDays) : undefined,
      marketingConsent: consentOnly,
    };
  }

  async function doPreview() {
    setPreviewing(true);
    try {
      const res = await api.smsSegmentPreview(segment());
      setPreview(res.count);
    } finally {
      setPreviewing(false);
    }
  }

  async function createAndRun() {
    setBusy(true); setStatus(null);
    try {
      const campaign = await api.createCampaign({ name, body, segment: segment() });
      const res = await api.runCampaign(campaign.id);
      setStatus(`Sent ${res.sent} of ${res.recipients} (${res.failed} failed).`);
      setName(""); setBody("");
      campaigns.reload();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function sendSingle() {
    setSingleStatus(null);
    try {
      await api.smsSend(phone, singleBody);
      setSingleStatus("Sent.");
      setPhone(""); setSingleBody("");
    } catch (e) {
      setSingleStatus(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <>
      <PageHeader title="SMS Marketing" subtitle="Reach customers via Africa's Talking" />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* campaign builder */}
        <div className="card p-6">
          <p className="font-display font-bold text-white">Promotional campaign</p>

          <div className="mt-4 space-y-3">
            <div>
              <label className="label">Campaign name</label>
              <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="April sale" />
            </div>
            <div>
              <label className="label">Message ({body.length} chars)</label>
              <textarea className="field min-h-24" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Hi! Enjoy 10% off all mailers this week…" />
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-ink-line p-4">
            <p className="label">Audience segment</p>
            <div className="space-y-3">
              <div>
                <label className="label">Tags (comma separated, any match)</label>
                <input className="field" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="vip, wholesale" />
              </div>
              <div>
                <label className="label">Ordered within (days)</label>
                <input className="field" type="number" value={lastDays} onChange={(e) => setLastDays(e.target.value)} placeholder="e.g. 90" />
              </div>
              <div className="flex items-center gap-3">
                <Toggle checked={hasOrdered} onChange={setHasOrdered} />
                <span className="text-sm text-cloud">Only customers who have ordered</span>
              </div>
              <div className="flex items-center gap-3">
                <Toggle checked={consentOnly} onChange={setConsentOnly} />
                <span className="text-sm text-cloud">Only marketing-consented</span>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button className="btn-ghost" onClick={doPreview} disabled={previewing}>
                {previewing ? "Checking…" : "Preview recipients"}
              </button>
              {preview !== null && <Badge tone="indigo">{preview} recipients</Badge>}
            </div>
          </div>

          {status && <p className="mt-4 text-sm text-whatsapp">{status}</p>}
          <button
            className="btn-primary mt-4 w-full"
            onClick={createAndRun}
            disabled={busy || !name || !body}
          >
            {busy ? "Sending…" : "Create & send campaign"}
          </button>
        </div>

        {/* single send + history */}
        <div className="space-y-6">
          <div className="card p-6">
            <p className="font-display font-bold text-white">Quick single SMS</p>
            <div className="mt-4 space-y-3">
              <input className="field" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07XX XXX XXX" />
              <textarea className="field min-h-20" value={singleBody} onChange={(e) => setSingleBody(e.target.value)} placeholder="Message…" />
              {singleStatus && <p className="text-sm text-muted">{singleStatus}</p>}
              <button className="btn-ghost w-full" onClick={sendSingle} disabled={!phone || !singleBody}>
                Send SMS
              </button>
            </div>
          </div>

          <div className="card overflow-hidden">
            <p className="border-b border-ink-line px-6 py-4 font-display font-bold text-white">
              Recent campaigns
            </p>
            {campaigns.loading ? (
              <div className="p-6"><Spinner /></div>
            ) : (campaigns.data ?? []).length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-muted">No campaigns yet.</p>
            ) : (
              <table className="w-full">
                <tbody>
                  {campaigns.data!.map((c: SmsCampaign) => (
                    <tr key={c.id} className="border-b border-ink-line/60 last:border-0">
                      <td className="td font-medium text-white">{c.name}</td>
                      <td className="td text-right text-muted">{c.recipients} sent</td>
                      <td className="td text-right"><Badge>{c.status.toLowerCase()}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
