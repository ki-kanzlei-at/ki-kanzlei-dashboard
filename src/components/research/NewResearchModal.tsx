"use client";

import { useEffect, useState } from "react";
import { X, Search, ArrowRight, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Favicon, IndustryTag, StatusBadge } from "./shared";
import type { Lead } from "@/types/leads";

export interface StartPayload {
  method: "crm" | "url" | "target" | "audience";
  leadId?: string;
  url?: string;
  company?: string;
  website?: string | null;
  industry?: string | null;
  city?: string | null;
  // Zielgruppe (audience)
  branche?: string;
  region?: string;
  country?: string;
  size?: string;
  revenue?: string;
  criteria?: string;
}

const METHODS = [
  { v: "manual" as const, title: "Manuell", desc: "Website der Firma eingeben — am genauesten" },
  { v: "crm" as const, title: "Aus Leads", desc: "Einen bestehenden Lead aus deinem CRM auswählen" },
];

const COUNTRIES = [
  { code: "AT", label: "Österreich" },
  { code: "DE", label: "Deutschland" },
  { code: "CH", label: "Schweiz" },
];

export function NewResearchModal({
  onClose,
  onStart,
}: {
  onClose: () => void;
  onStart: (p: StartPayload) => void;
}) {
  const [method, setMethod] = useState<"target" | "crm" | "manual">("manual");

  // Zielgruppe
  const [zgBranche, setZgBranche] = useState("");
  const [zgRegion, setZgRegion] = useState("");
  const [zgCountry, setZgCountry] = useState("AT");
  const [zgSize, setZgSize] = useState("");
  const [zgRevenue, setZgRevenue] = useState("");
  const [zgCriteria, setZgCriteria] = useState("");
  const [targetCustomer, setTargetCustomer] = useState("");

  // Aus Leads
  const [crmQ, setCrmQ] = useState("");
  const [crmList, setCrmList] = useState<Lead[]>([]);
  const [crmLoading, setCrmLoading] = useState(true);

  // Manuell
  const [mCompany, setMCompany] = useState("");
  const [mWebsite, setMWebsite] = useState("");
  const [mBranche, setMBranche] = useState("");
  const [mDomain, setMDomain] = useState<string | null>(null);
  const [mStarting, setMStarting] = useState(false);

  /* Gespeicherte Zielkunden laden und Zielgruppe vorbelegen */
  useEffect(() => {
    let alive = true;
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j?.data) return;
        const tc = (j.data.brand_settings?.target_customer || "").trim();
        setTargetCustomer(tc);
        if (tc) setZgBranche((prev) => prev || tc);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  /* CRM-Leads laden (debounced) */
  useEffect(() => {
    if (method !== "crm") return;
    let cancelled = false;
    const t = setTimeout(() => {
      setCrmLoading(true);
      const qs = new URLSearchParams({ limit: "25", page: "1", sort_by: "created_at", sort_dir: "desc" });
      if (crmQ.trim()) qs.set("search", crmQ.trim());
      fetch(`/api/leads?${qs.toString()}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (!cancelled) setCrmList(j?.data ?? []); })
        .catch(() => { if (!cancelled) setCrmList([]); })
        .finally(() => { if (!cancelled) setCrmLoading(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [method, crmQ]);

  /* Manuell: Domain automatisch erkennen (debounced) */
  useEffect(() => {
    if (method !== "manual") return;
    const c = mCompany.trim();
    let cancelled = false;
    const t = setTimeout(() => {
      if (c.length < 3) { setMDomain(null); return; }
      fetch("/api/research/resolve-domain", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: c, country: "AT" }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (cancelled) return;
          const d: string | null = j?.data?.domain ?? null;
          setMDomain(d);
          if (d) setMWebsite((prev) => prev || d); // füllt Website → Favicon in der Loading-Karte
        })
        .catch(() => { if (!cancelled) setMDomain(null); });
    }, 700);
    return () => { cancelled = true; clearTimeout(t); };
  }, [method, mCompany]);

  const activeMethod = METHODS.find((m) => m.v === method)!;

  function startAudience() {
    if (!zgBranche.trim()) return;
    onStart({
      method: "audience",
      branche: zgBranche.trim(),
      region: zgRegion.trim(),
      country: zgCountry,
      size: zgSize.trim(),
      revenue: zgRevenue.trim(),
      criteria: zgCriteria.trim(),
    });
  }

  async function startManual() {
    const website = (mWebsite.trim() || mDomain || "").trim();
    if (!website || mStarting) return;
    // Website ist Pflicht → genauestes Ergebnis. Mit Firma „target", sonst „url" (leitet
    // den Firmennamen aus der Domain ab).
    if (mCompany.trim()) {
      onStart({ method: "target", company: mCompany.trim(), website, industry: mBranche.trim() || null });
    } else {
      onStart({ method: "url", url: website });
    }
  }

  return (
    <div className="air-modal-overlay" onClick={onClose}>
      <div className="air-modal" onClick={(e) => e.stopPropagation()}>
        <div className="air-modal-head">
          <div className="air-modal-head-info">
            <h3>Neue Recherche</h3>
            <p>Finde passende Firmen zu deinen Produkten, wähle einen Lead oder gib eine Firma selbst ein.</p>
          </div>
          <button className="icon-btn" onClick={onClose}><X width={16} height={16} /></button>
        </div>

        <div className="tabs-list">
          {METHODS.map((m) => (
            <button
              key={m.v}
              className="tabs-trigger"
              data-state={method === m.v ? "active" : "inactive"}
              onClick={() => setMethod(m.v)}
            >
              {m.title}
            </button>
          ))}
        </div>

        <div className="air-modal-body">
          <p className="air-method-desc">{activeMethod.desc}</p>

          {/* ── Zielgruppe ── */}
          {method === "target" && (
            <>
              {targetCustomer && (
                <div className="air-disc-meta">Deine gespeicherten Zielkunden: {targetCustomer}</div>
              )}
              <div className="air-field">
                <label className="label">Zielgruppe oder Branche</label>
                <div className="input">
                  <input
                    value={zgBranche}
                    onChange={(e) => setZgBranche(e.target.value)}
                    placeholder="z. B. Steuerberater, Logistik, Bauunternehmen"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") startAudience(); }}
                  />
                </div>
              </div>
              <div className="air-field">
                <label className="label">Region (optional)</label>
                <div className="input">
                  <input
                    value={zgRegion}
                    onChange={(e) => setZgRegion(e.target.value)}
                    placeholder="z. B. Wien, Oberösterreich"
                    onKeyDown={(e) => { if (e.key === "Enter") startAudience(); }}
                  />
                </div>
              </div>
              <div className="air-field">
                <label className="label">Land</label>
                <div className="air-rail-filters">
                  {COUNTRIES.map((c) => (
                    <button key={c.code} className={`air-filter-chip ${zgCountry === c.code ? "is-active" : ""}`} onClick={() => setZgCountry(c.code)}>{c.label}</button>
                  ))}
                </div>
              </div>
              <div className="air-field">
                <label className="label">Mitarbeiter ab (optional)</label>
                <div className="input">
                  <input
                    value={zgSize}
                    onChange={(e) => setZgSize(e.target.value)}
                    placeholder="z. B. 20"
                    onKeyDown={(e) => { if (e.key === "Enter") startAudience(); }}
                  />
                </div>
              </div>
              <div className="air-field">
                <label className="label">Umsatz ab (optional)</label>
                <div className="input">
                  <input
                    value={zgRevenue}
                    onChange={(e) => setZgRevenue(e.target.value)}
                    placeholder="z. B. 2 Mio"
                    onKeyDown={(e) => { if (e.key === "Enter") startAudience(); }}
                  />
                </div>
              </div>
              <div className="air-field">
                <label className="label">Weitere Kriterien (optional)</label>
                <div className="input">
                  <input
                    value={zgCriteria}
                    onChange={(e) => setZgCriteria(e.target.value)}
                    placeholder="z. B. digital, wachsend, mehrere Standorte"
                    onKeyDown={(e) => { if (e.key === "Enter") startAudience(); }}
                  />
                </div>
              </div>
              <div className="air-disc-meta">Beim Start bekommst du im Chat passende Beispielfirmen samt Ansatz, was du ihnen anbieten kannst.</div>
            </>
          )}

          {/* ── Aus Leads ── */}
          {method === "crm" && (
            <>
              <div className="air-field">
                <div className="input">
                  <Search className="lead-ico" />
                  <input
                    value={crmQ}
                    onChange={(e) => setCrmQ(e.target.value)}
                    placeholder="Lead nach Firma, Kontakt oder E-Mail suchen"
                    autoFocus
                  />
                  {crmLoading && <Loader2 className="trail-ico" style={{ animation: "air-spin .7s linear infinite" }} />}
                </div>
              </div>
              {!crmLoading && crmList.length > 0 && (
                <div className="air-disc-meta"><b>{crmList.length}</b> Leads. Wähle einen zur Recherche.</div>
              )}
              <div className="air-disc-list">
                {crmLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="air-disc-row" style={{ cursor: "default" }}>
                      <Skeleton className="h-8 w-8 rounded-lg" />
                      <div className="air-disc-info">
                        <Skeleton className="h-3.5 w-40 rounded" />
                        <Skeleton className="mt-2 h-3 w-24 rounded" />
                      </div>
                    </div>
                  ))
                ) : crmList.length ? crmList.map((lead) => (
                  <div
                    key={lead.id}
                    className="air-disc-row"
                    onClick={() => onStart({ method: "crm", leadId: lead.id, company: lead.company, website: lead.website })}
                  >
                    <Favicon web={lead.website} company={lead.company} />
                    <div className="air-disc-info">
                      <div className="air-disc-name">{lead.company}</div>
                      <div className="air-disc-sub">
                        <IndustryTag industry={lead.industry} />
                        {lead.city && <span className="meta-txt">{lead.city}</span>}
                        <StatusBadge status={lead.status} />
                      </div>
                    </div>
                    <div className="air-disc-right">
                      <span className="air-disc-go"><ArrowRight width={16} height={16} /></span>
                    </div>
                  </div>
                )) : (
                  <div className="air-disc-empty">Kein Lead gefunden. Nutze Zielgruppe oder Manuell.</div>
                )}
              </div>
            </>
          )}

          {/* ── Manuell ── */}
          {method === "manual" && (
            <>
              <div className="air-field">
                <label className="label">Website</label>
                <div className="input">
                  <input
                    value={mWebsite}
                    onChange={(e) => setMWebsite(e.target.value)}
                    placeholder="z. B. firma.at"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") startManual(); }}
                  />
                </div>
              </div>
              <div className="air-field">
                <label className="label">Firma (optional)</label>
                <div className="input">
                  <input
                    value={mCompany}
                    onChange={(e) => setMCompany(e.target.value)}
                    placeholder="Name der Firma, falls bekannt"
                  />
                </div>
              </div>
              <div className="air-field">
                <label className="label">Branche (optional)</label>
                <div className="input">
                  <input
                    value={mBranche}
                    onChange={(e) => setMBranche(e.target.value)}
                    placeholder="Branche, falls bekannt"
                    onKeyDown={(e) => { if (e.key === "Enter") startManual(); }}
                  />
                </div>
              </div>
              <div className="air-disc-meta">Gib die Website der Firma ein — daraus recherchieren wir am genauesten. Firma &amp; Branche sind optional.</div>
            </>
          )}
        </div>

        <div className="air-modal-foot">
          <span className="hint"><Search width={12} height={12} /> Eine Recherche verbraucht 2 Credits</span>
          <span className="grow" />
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Abbrechen</button>
          {method === "target" && (
            <button className="btn btn-default btn-sm" onClick={startAudience} disabled={!zgBranche.trim()}>
              Recherche starten <ArrowRight width={14} height={14} />
            </button>
          )}
          {method === "manual" && (
            <button className="btn btn-default btn-sm" onClick={startManual} disabled={!mWebsite.trim() || mStarting}>
              {mStarting ? <><Loader2 width={14} height={14} style={{ animation: "air-spin .7s linear infinite" }} /> Domain wird gesucht</> : <>Recherche starten <ArrowRight width={14} height={14} /></>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
