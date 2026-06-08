"use client";

import { useEffect, useRef, useState, useCallback, type ChangeEvent } from "react";
import { toast } from "sonner";
import {
  Plus, Search, Send, Paperclip, ExternalLink, Check, X, Trash2, RefreshCw, AlertTriangle,
  Copy, ThumbsUp, ThumbsDown, ArrowRight, MessageCircle, MoreHorizontal,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Favicon, Score, StatusBadge, IndustryTag, SourceBadge, renderInline, renderStreaming } from "./shared";
import { NewResearchModal, type StartPayload } from "./NewResearchModal";
import { LinkedInProfileCard } from "./LinkedInProfileCard";
import { blocksToPlainText, normalizeDomain, companyFromDomain } from "@/lib/research/format";
import type {
  ResearchSession, ResearchSessionWithMessages, ResearchMessage, SavedCard, ResearchSource,
} from "@/types/research";

const LOGO = "/KI-Kanzlei_Logo_2026.png";

const RESEARCH_STEPS = [
  { label: "Quelle erkannt", detail: "Domain" },
  { label: "Website wird analysiert", detail: "" },
  { label: "Firmenbuch & Web durchsucht", detail: "Firmenbuch · Google" },
  { label: "Daten zusammengeführt", detail: "" },
  { label: "Überblick wird erstellt", detail: "" },
];

const AUDIENCE_STEPS = [
  { label: "Zielgruppe erkannt", detail: "" },
  { label: "Passende Firmen gesucht", detail: "Google" },
  { label: "Firmen geprüft", detail: "" },
  { label: "Angebots-Ansatz erstellt", detail: "" },
];


function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "gerade";
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.floor(h / 24);
  if (d === 1) return "gestern";
  return `vor ${d} Tagen`;
}

/* ════════════════════════════ Rail ════════════════════════════ */
const RAIL_FILTERS = [
  { k: "all", label: "Alle" },
  { k: "saved", label: "Gespeichert" },
  { k: "crm", label: "CRM" },
  { k: "url", label: "Website" },
  { k: "target", label: "Manuell" },
] as const;
type RailFilter = (typeof RAIL_FILTERS)[number]["k"];

function Rail({
  sessions, activeId, onSelect, onNew, onDelete, loading,
}: {
  sessions: ResearchSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  loading: boolean;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<RailFilter>("all");
  const [visible, setVisible] = useState(5);
  const filtered = sessions.filter((s) => {
    if (q && !s.company.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === "all") return true;
    if (filter === "saved") return !!s.saved_lead_id;
    return s.method === filter;
  });
  const shown = filtered.slice(0, visible);
  return (
    <div className="air-rail">
      <div className="air-rail-head">
        <button className="btn btn-default air-new" onClick={onNew}><Plus width={15} height={15} /> Neue Recherche</button>
        <div className="input input-sm">
          <Search className="lead-ico" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Recherchen durchsuchen …" />
        </div>
        <div className="air-rail-filters">
          {RAIL_FILTERS.map((f) => (
            <button key={f.k} className={`air-filter-chip ${filter === f.k ? "is-active" : ""}`} onClick={() => setFilter(f.k)}>{f.label}</button>
          ))}
        </div>
      </div>
      <div className="air-rail-scroll">
        <div className="air-rail-section">Letzte Recherchen</div>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="air-session" style={{ cursor: "default" }}>
              <Skeleton className="h-[30px] w-[30px] rounded-[7px]" />
              <div className="air-session-info">
                <Skeleton className="h-3 w-28 rounded" />
                <Skeleton className="mt-2 h-2.5 w-16 rounded" />
              </div>
            </div>
          ))
        ) : filtered.length ? (<>
          {shown.map((s) => (
          <div key={s.id} className={`air-session ${s.id === activeId ? "is-active" : ""}`} onClick={() => onSelect(s.id)}>
            <Favicon web={s.website} company={s.company} />
            <div className="air-session-info">
              <div className="air-session-top">
                <div className="air-session-name">{s.company}</div>
                <span className="air-session-when">{relTime(s.updated_at)}</span>
              </div>
              <div className="air-session-meta">{[s.industry, s.city].filter(Boolean).join(" · ") || "Recherche"}</div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="air-session-del" title="Optionen" onClick={(e) => e.stopPropagation()}>
                  <MoreHorizontal width={15} height={15} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-white" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem variant="destructive" onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}>
                  <Trash2 className="h-4 w-4" /> Recherche löschen
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          ))}
          {filtered.length > visible && (
            <button className="air-load-more" onClick={() => setVisible((v) => v + 10)}>
              Mehr laden <span className="air-load-more-count">({filtered.length - visible})</span>
            </button>
          )}
        </>) : <div className="air-rail-empty">{q || filter !== "all" ? "Keine Treffer." : "Noch keine Recherchen."}</div>}
      </div>
    </div>
  );
}

/* ════════════════════════════ Messages ════════════════════════════ */
function AiMessage({ msg, onRegenerate, busy, sources, animate }: { msg: ResearchMessage; onRegenerate?: (id: string) => Promise<void>; busy?: boolean; sources?: ResearchSource[]; animate?: boolean }) {
  const blocks = msg.blocks ?? [];
  const counter = { i: 0 }; // läuft über alle Blöcke der Nachricht weiter (Streaming-Reihenfolge)
  const ri = (t: string) => (animate ? renderStreaming(t, sources, counter) : renderInline(t, sources));
  const [fb, setFb] = useState<"up" | "down" | null>(null);
  const [regen, setRegen] = useState(false);
  function copy() {
    navigator.clipboard?.writeText(blocksToPlainText(blocks)).then(
      () => toast.success("In die Zwischenablage kopiert"),
      () => toast.error("Kopieren fehlgeschlagen"),
    );
  }
  async function regenerate() {
    if (!onRegenerate || regen || busy) return;
    setRegen(true);
    try { await onRegenerate(msg.id); } finally { setRegen(false); }
  }
  return (
    <div className="air-msg-ai">
      <div className="air-ai-avatar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO} alt="" />
      </div>
      <div className="air-ai-body">
        {regen ? (
          <div className="air-regen">
            <div className="air-typing"><span /><span /><span /></div>
            <span className="air-regen-label">Wird neu formuliert …</span>
          </div>
        ) : (
          <>
            {blocks.map((b, i) => {
              if (b.type === "h") return <h4 key={i}>{ri(b.text)}</h4>;
              if (b.type === "ul") return <ul key={i}>{b.items.map((it, j) => <li key={j}>{ri(it)}</li>)}</ul>;
              return <p key={i}>{ri(b.text)}</p>;
            })}
            <div className="air-ai-meta">
              <span className="label">War das hilfreich?</span>
              {onRegenerate && (
                <button className="icon-btn" title="Neu formulieren" onClick={regenerate} disabled={busy}>
                  <RefreshCw width={14} height={14} />
                </button>
              )}
              <button className="icon-btn" title="Kopieren" onClick={copy}><Copy width={14} height={14} /></button>
              <button className={`icon-btn ${fb === "up" ? "is-active" : ""}`} title="Hilfreich"
                onClick={() => { setFb("up"); toast.success("Als hilfreich markiert"); }}>
                <ThumbsUp width={14} height={14} />
              </button>
              <button className={`icon-btn ${fb === "down" ? "is-active" : ""}`} title="Nicht hilfreich"
                onClick={() => { setFb("down"); toast("Danke für dein Feedback"); }}>
                <ThumbsDown width={14} height={14} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function UserMessage({ text }: { text: string }) {
  return <div className="air-msg-user"><div className="air-user-bubble">{text}</div></div>;
}

/* Gespeicherte LinkedIn-Personensuche: kurze Zeile + Profilkarte (mehrfach möglich) */
function PersonMessage({ msg, company }: { msg: ResearchMessage; company: string }) {
  const blocks = msg.blocks ?? [];
  return (
    <div className="air-msg-ai">
      <div className="air-ai-avatar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO} alt="" />
      </div>
      <div className="air-ai-body">
        {blocks.map((b, i) => {
          if (b.type === "h") return <h4 key={i}>{b.text}</h4>;
          if (b.type === "ul") return <ul key={i}>{b.items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}</ul>;
          return <p key={i}>{renderInline(b.text)}</p>;
        })}
        {msg.person && <LinkedInProfileCard person={msg.person} company={company} />}
      </div>
    </div>
  );
}

function Typing() {
  return (
    <div className="air-msg-ai">
      <div className="air-ai-avatar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO} alt="" />
      </div>
      <div className="air-ai-body"><div className="air-typing"><span /><span /><span /></div></div>
    </div>
  );
}

function SavedCardView({ card }: { card: SavedCard }) {
  return (
    <div className="air-saved">
      <span className="air-saved-check"><Check width={13} height={13} /></span>
      <div className="air-saved-info">
        <div className="air-saved-title">Als Lead gespeichert</div>
        <div className="air-saved-sub">{card.company} · {card.when} · neue Erkenntnisse aus dem Chat kannst du später ergänzen</div>
      </div>
      <a href={card.leadId ? `/dashboard/leads?lead=${card.leadId}` : "/dashboard/leads"} className="btn btn-outline btn-sm air-saved-open" style={{ textDecoration: "none" }}>
        Im Lead öffnen <ArrowRight width={13} height={13} />
      </a>
    </div>
  );
}

/* ════════════════════════════ Research Loading ════════════════════════════ */
function ResearchLoading({ subject, step, steps, audience }: { subject: { company: string; website?: string | null }; step: number; steps: { label: string; detail: string }[]; audience?: boolean }) {
  return (
    <div className="air-loading">
      <div className="card air-loading-card">
        <div className="air-load-query">
          {audience ? (
            <span className="air-load-ico"><Search width={20} height={20} /></span>
          ) : (
            <Favicon web={subject.website} company={subject.company} />
          )}
          <div>
            <div className="q-name">{subject.company}</div>
            <div className="q-sub">{audience ? "Passende Firmen werden gesucht" : (subject.website || "Recherche")} · Recherche läuft …</div>
          </div>
          <span className="ls-spin" />
        </div>
        {steps.map((s, i) => {
          const state = i < step ? "is-done" : i === step ? "is-active" : "is-pending";
          return (
            <div key={i} className={`air-lstep ${state}`}>
              <span className="air-lstep-mark">{i < step && <Check width={11} height={11} />}</span>
              <span className="air-lstep-label">{s.label}</span>
              {i === step ? <span className="air-lstep-spin" />
                : i < step ? <span className="air-lstep-detail">{s.detail || "fertig"}</span>
                : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ════════════════════════════ Chat skeleton (Laden) ════════════════════════════ */
function ChatSkeleton() {
  return (
    <div className="air-chat">
      <div className="air-chat-head">
        <Skeleton className="h-10 w-10 rounded-[9px]" />
        <div className="air-chat-head-info flex flex-col gap-2">
          <Skeleton className="h-4 w-56 rounded" />
          <Skeleton className="h-3 w-40 rounded" />
        </div>
      </div>
      <div className="air-sources">
        <Skeleton className="h-[22px] w-28 rounded-md" />
        <Skeleton className="h-[22px] w-24 rounded-md" />
        <Skeleton className="h-[22px] w-32 rounded-md" />
      </div>
      <div className="air-thread">
        <div className="air-thread-inner" style={{ gap: 12 }}>
          <Skeleton className="h-4 w-3/4 rounded" />
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-5/6 rounded" />
          <Skeleton className="h-4 w-2/3 rounded" />
          <Skeleton className="h-4 w-11/12 rounded" />
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════ Chat column ════════════════════════════ */
function ChatColumn({
  session, busy, saved, saving, onSave, onSend, onRegenerate,
}: {
  session: ResearchSessionWithMessages;
  busy: boolean;
  saved: boolean;
  saving: boolean;
  onSave: () => void;
  onSend: (q: string) => void;
  onRegenerate: (id: string) => Promise<void>;
}) {
  const [showAll, setShowAll] = useState(false);
  const [draft, setDraft] = useState("");
  const [attached, setAttached] = useState<{ name: string; text: string } | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Quellen-Aufklappen zurücksetzen, wenn die Session wechselt (Render-Zeit-Pattern)
  const [prevSid, setPrevSid] = useState(session.id);
  if (session.id !== prevSid) { setPrevSid(session.id); setShowAll(false); }

  // Streaming-Reveal nur für die gerade frisch eingetroffene KI-Nachricht (nicht beim
  // Verlauf-Laden oder Session-Wechsel) — sonst „tippen" alte Antworten erneut.
  const [animateId, setAnimateId] = useState<string | null>(null);
  const animPrevSid = useRef(session.id);
  const knownIds = useRef<Set<string>>(new Set(session.messages.map((m) => m.id)));
  useEffect(() => {
    if (animPrevSid.current !== session.id) {
      animPrevSid.current = session.id;
      knownIds.current = new Set(session.messages.map((m) => m.id));
      setAnimateId(null);
      return;
    }
    const fresh = session.messages.filter((m) => !knownIds.current.has(m.id));
    if (!fresh.length) return;
    knownIds.current = new Set(session.messages.map((m) => m.id));
    const lastAi = [...fresh].reverse().find((m) => m.role !== "user" && !m.card && !m.person && !!m.blocks?.length);
    if (lastAi) setAnimateId(lastAi.id);
  }, [session.id, session.messages]);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [session.messages, busy]);

  function grow() {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }
  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const isText = /\.(txt|md|markdown|csv|json|html?|log)$/i.test(f.name) || f.type.startsWith("text");
    if (!isText) { toast.error("Bitte eine Textdatei (.txt, .md, .csv, .json)"); return; }
    if (f.size > 300_000) { toast.error("Datei zu groß (max. 300 KB)"); return; }
    const reader = new FileReader();
    reader.onload = () => setAttached({ name: f.name, text: String(reader.result || "").slice(0, 6000) });
    reader.onerror = () => toast.error("Datei konnte nicht gelesen werden");
    reader.readAsText(f);
  }
  function submit() {
    const v = draft.trim();
    if ((!v && !attached) || busy) return;
    const text = attached
      ? `Kontext aus Datei „${attached.name}":\n${attached.text}\n\nFrage: ${v || "Fasse die wichtigsten Punkte aus der Datei für diesen Lead zusammen und nenne mögliche Ansatzpunkte."}`
      : v;
    onSend(text);
    setDraft("");
    setAttached(null);
    requestAnimationFrame(() => { if (taRef.current) taRef.current.style.height = "auto"; });
  }

  const sources = session.sources ?? [];
  const shown = showAll ? sources : sources.slice(0, 4);

  return (
    <div className="air-chat">
      <div className="air-chat-head">
        <Favicon web={session.website} company={session.company} />
        <div className="air-chat-head-info">
          <h2>{session.company}</h2>
          <div className="sub">
            <IndustryTag industry={session.industry} />
            {session.website && <><span className="air-sep" /><a href={`https://${normalizeDomain(session.website)}`} target="_blank" rel="noreferrer">{normalizeDomain(session.website)}</a></>}
            {session.city && <><span className="air-sep" /><span>{[session.city, session.state].filter(Boolean).join(", ")}</span></>}
          </div>
        </div>
        {session.score != null && (
          <div className="air-head-score">
            {session.status && <StatusBadge status={session.status} />}
            <Score value={session.score} />
          </div>
        )}
        <div className="air-chat-head-actions">
          {session.saved_lead_id ? (
            <a className="btn btn-sm btn-outline" href={`/dashboard/leads?lead=${session.saved_lead_id}`} style={{ textDecoration: "none" }}>
              <ExternalLink width={14} height={14} /> Zum Lead
            </a>
          ) : (
            <button className="btn btn-sm btn-default" onClick={onSave} disabled={saving}>
              {saving ? <>Speichert …</> : <><Plus width={14} height={14} /> Als Lead</>}
            </button>
          )}
          {session.website && (
            <a className="icon-btn icon-btn-outline" href={`https://${normalizeDomain(session.website)}`} target="_blank" rel="noreferrer" title="Website öffnen"><ExternalLink width={15} height={15} /></a>
          )}
        </div>
      </div>

      {sources.length > 0 && (
        <div className="air-sources">
          <span className="air-sources-label">Recherchiert aus <b>{sources.length}</b> Quellen</span>
          <div className="air-sources-row">
            {shown.map((src) => <SourceBadge key={src.n} source={src} />)}
            {sources.length > 4 && (
              <button className="air-src-more" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "weniger anzeigen" : `+${sources.length - 4} weitere`}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="air-thread" ref={threadRef}>
        <div className="air-thread-inner">
          {session.messages.map((m) => (
            m.role === "user" ? <UserMessage key={m.id} text={m.text ?? ""} />
              : m.role === "system" && m.card ? <SavedCardView key={m.id} card={m.card} />
                : m.person ? <PersonMessage key={m.id} msg={m} company={session.company} />
                  : <AiMessage key={m.id} msg={m} onRegenerate={onRegenerate} busy={busy} sources={session.sources} animate={animateId === m.id} />
          ))}
          {busy && <Typing />}
        </div>
      </div>

      <div className="air-composer-wrap">
        {session.suggestions.length > 0 && (
          <div className="air-suggest">
            {session.suggestions.map((s, i) => (
              <button key={i} className="air-suggest-chip" onClick={() => !busy && onSend(s)} disabled={busy}>{s}</button>
            ))}
          </div>
        )}
        {attached && (
          <div className="air-attach-chip">
            <Paperclip width={13} height={13} />
            <span className="nm">{attached.name}</span>
            <button className="x" title="Entfernen" onClick={() => setAttached(null)}><X width={13} height={13} /></button>
          </div>
        )}
        <div className="air-composer">
          <textarea
            ref={taRef}
            value={draft}
            rows={1}
            placeholder={`Frag etwas über ${session.company.split(" ")[0]} …`}
            onChange={(e) => { setDraft(e.target.value); grow(); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          />
          <div className="air-composer-tools">
            <input ref={fileRef} type="file" accept=".txt,.md,.markdown,.csv,.json,.html,.htm,.log,text/*" style={{ display: "none" }} onChange={onFile} />
            <button className="icon-btn" title="Textdatei als Kontext anhängen" onClick={() => fileRef.current?.click()}><Paperclip width={16} height={16} /></button>
            <button className="air-send" onClick={submit} disabled={busy || (!draft.trim() && !attached)}><Send width={17} height={17} /></button>
          </div>
        </div>
        <div className="air-composer-foot">Antworten basieren auf öffentlichen Quellen, bitte vor Verwendung prüfen.</div>
      </div>
    </div>
  );
}

/* ════════════════════════════ App ════════════════════════════ */
export function AiResearcher() {
  const [sessions, setSessions] = useState<ResearchSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ResearchSessionWithMessages | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadStep, setLoadStep] = useState(0);
  const [loadSubject, setLoadSubject] = useState<{ company: string; website?: string | null }>({ company: "Recherche" });
  const [loadAudience, setLoadAudience] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/research/${id}`);
      if (res.ok) { const j = await res.json(); setDetail(j.data); }
    } catch { /* ignore */ }
  }, []);

  // Initial: Sessions laden
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/research");
        if (!res.ok) return;
        const j = await res.json();
        const list: ResearchSession[] = j.data ?? [];
        setSessions(list);

        const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
        const sid = params?.get("session");
        const leadId = params?.get("leadId");

        // Deep-Link aus dem Lead-Sheet: ?leadId=<id> → bestehende Recherche öffnen ODER neue starten
        if (leadId) {
          const existing = list.find((s) => s.lead_id === leadId || s.saved_lead_id === leadId);
          if (params) { params.delete("leadId"); window.history.replaceState(null, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`); }
          if (existing) { setActiveId(existing.id); loadDetail(existing.id); }
          else {
            try {
              const lr = await fetch(`/api/leads/${leadId}`);
              const lead = lr.ok ? (await lr.json()).data : null;
              startResearch({ method: "crm", leadId, company: lead?.company ?? "Lead", website: lead?.website ?? null });
            } catch { startResearch({ method: "crm", leadId, company: "Lead", website: null }); }
          }
          return;
        }

        if (list.length) {
          // ?session=<id> → direkt diese Recherche öffnen
          const target = sid && list.some((s) => s.id === sid) ? sid : list[0].id;
          setActiveId(target);
          loadDetail(target);
        }
      } catch { /* ignore */ }
      finally { setSessionsLoading(false); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadDetail]);

  function selectSession(id: string) {
    if (id === activeId) return;
    setActiveId(id);
    setDetail(null);
    loadDetail(id);
  }

  async function confirmDelete() {
    const id = deleteId;
    if (!id) return;
    setDeleting(true);
    const remaining = sessions.filter((s) => s.id !== id);
    try {
      const res = await fetch(`/api/research/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setSessions(remaining);
      // Falls die offene Recherche gelöscht wird: zur nächsten wechseln (oder leeren)
      if (activeId === id) {
        if (remaining.length) { setActiveId(remaining[0].id); setDetail(null); loadDetail(remaining[0].id); }
        else { setActiveId(null); setDetail(null); }
      }
      toast.success("Recherche gelöscht");
      setDeleteId(null);
    } catch {
      toast.error("Löschen fehlgeschlagen");
    } finally {
      setDeleting(false);
    }
  }

  function startSteps(len: number) {
    setLoadStep(0);
    let i = 0;
    stepTimer.current = setInterval(() => {
      i += 1;
      setLoadStep(i >= len ? len - 1 : i);
    }, 750);
  }
  function stopSteps() {
    if (stepTimer.current) { clearInterval(stepTimer.current); stepTimer.current = null; }
  }
  useEffect(() => () => stopSteps(), []);

  async function startResearch(payload: StartPayload) {
    setModalOpen(false);
    // Loading-Subjekt für die Pipeline-Karte ableiten
    let subj: { company: string; website?: string | null };
    const isAudience = payload.method === "audience";
    if (isAudience) {
      subj = { company: `Zielgruppe: ${payload.branche || ""}`.trim(), website: null };
    } else if (payload.method === "url") {
      const dom = normalizeDomain(payload.url || "");
      subj = { company: companyFromDomain(dom), website: dom };
    } else {
      subj = { company: payload.company || "Lead", website: payload.website ?? null };
    }
    setLoadSubject(subj);
    setLoadAudience(isAudience);
    setLoading(true);
    setDetail(null);
    setActiveId(null);
    startSteps(isAudience ? AUDIENCE_STEPS.length : RESEARCH_STEPS.length);

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error || "Recherche fehlgeschlagen");
        setLoading(false);
        stopSteps();
        // zur vorherigen Session zurück
        if (sessions.length) { setActiveId(sessions[0].id); loadDetail(sessions[0].id); }
        return;
      }
      const { session, messages, remaining } = j.data as {
        session: ResearchSession; messages: ResearchMessage[]; remaining: number;
      };
      setSessions((prev) => [session, ...prev.filter((s) => s.id !== session.id)]);
      setActiveId(session.id);
      setDetail({ ...session, messages });
      toast.success("Recherche abgeschlossen · 2 Credits verbraucht", { description: `${remaining.toLocaleString("de-DE")} Credits übrig` });
      window.dispatchEvent(new CustomEvent("credits:refresh"));
    } catch {
      toast.error("Recherche fehlgeschlagen");
      if (sessions.length) { setActiveId(sessions[0].id); loadDetail(sessions[0].id); }
    } finally {
      setLoading(false);
      stopSteps();
    }
  }

  async function sendQuestion(text: string) {
    if (!detail || busy) return;
    const sessionId = detail.id; // gegen Session-Wechsel während des Requests absichern
    const optimistic: ResearchMessage = { id: `tmp-${Date.now()}`, role: "user", text, created_at: new Date().toISOString() };
    setDetail((d) => (d && d.id === sessionId ? { ...d, messages: [...d.messages, optimistic] } : d));
    setBusy(true);
    try {
      const res = await fetch(`/api/research/${sessionId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error || "Antwort fehlgeschlagen");
        // optimistische Nachricht zurückrollen
        setDetail((d) => (d && d.id === sessionId ? { ...d, messages: d.messages.filter((m) => m.id !== optimistic.id) } : d));
        return;
      }
      const userMessage = j.data.userMessage as ResearchMessage | undefined;
      const aiMessage = j.data.aiMessage as ResearchMessage;
      const remaining = j.data.remaining as number | undefined;
      setDetail((d) => {
        if (!d || d.id !== sessionId) return d;
        const msgs = userMessage ? d.messages.map((m) => (m.id === optimistic.id ? userMessage : m)) : d.messages;
        return { ...d, messages: [...msgs, aiMessage] };
      });
      // Jede Frage kostet 2 Credits → Badge aktualisieren.
      window.dispatchEvent(new CustomEvent("credits:refresh"));
      if (typeof remaining === "number") {
        toast.success("2 Credits verbraucht", { description: `${remaining.toLocaleString("de-DE")} Credits übrig` });
      }
    } catch {
      toast.error("Antwort fehlgeschlagen");
      setDetail((d) => (d && d.id === sessionId ? { ...d, messages: d.messages.filter((m) => m.id !== optimistic.id) } : d));
    } finally {
      setBusy(false);
    }
  }

  async function regenerateMessage(messageId: string) {
    if (!detail) return;
    const sessionId = detail.id;
    try {
      const res = await fetch(`/api/research/${sessionId}/rewrite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
      });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || "Neu formulieren fehlgeschlagen"); return; }
      const aiMessage = j.data.aiMessage as ResearchMessage;
      setDetail((d) => (d && d.id === sessionId
        ? { ...d, messages: d.messages.map((m) => (m.id === messageId ? aiMessage : m)) }
        : d));
      toast.success("Antwort neu formuliert");
    } catch {
      toast.error("Neu formulieren fehlgeschlagen");
    }
  }

  async function saveToLead() {
    if (!detail || saving || detail.saved_lead_id) return;
    const sessionId = detail.id;
    setSaving(true);
    try {
      const res = await fetch(`/api/research/${sessionId}/save-to-lead`, { method: "POST" });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || "Speichern fehlgeschlagen"); return; }
      const { leadId, message, merged } = j.data as { leadId: string; message?: ResearchMessage; merged?: boolean };
      setDetail((d) => (d && d.id === sessionId ? {
        ...d,
        saved_lead_id: leadId,
        messages: message ? [...d.messages, message] : d.messages,
      } : d));
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, saved_lead_id: leadId } : s)));
      toast.success(merged ? "Lead aktualisiert" : "Als Lead gespeichert", {
        description: merged ? "Bestehender Eintrag ergänzt — keine Dublette angelegt" : "Im Lead-CRM auffindbar",
      });
    } catch {
      toast.error("Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="leads-v3 air-root">
      <div className="air-workspace">
        <Rail sessions={sessions} activeId={activeId} onSelect={selectSession} onNew={() => setModalOpen(true)} onDelete={setDeleteId} loading={sessionsLoading} />

        {loading ? (
          <div className="air-chat"><ResearchLoading subject={loadSubject} step={loadStep} steps={loadAudience ? AUDIENCE_STEPS : RESEARCH_STEPS} audience={loadAudience} /></div>
        ) : detail ? (
          <ChatColumn
            session={detail}
            busy={busy}
            saved={!!detail.saved_lead_id}
            saving={saving}
            onSave={saveToLead}
            onSend={sendQuestion}
            onRegenerate={regenerateMessage}
          />
        ) : (activeId || sessionsLoading) ? (
          <ChatSkeleton />
        ) : (
          <div className="air-chat">
            <div className="air-chat-empty">
              <div>
                <div className="air-empty-mark"><MessageCircle width={26} height={26} /></div>
                <div className="ttl">AI Researcher</div>
                <p className="sub">Recherchiere Leads aus öffentlichen Quellen — als Zielgruppe, aus dem CRM oder per Website. Jede Recherche liefert einen zitierten Überblick.</p>
                <button className="btn btn-default" style={{ marginTop: 16 }} onClick={() => setModalOpen(true)}>
                  <Plus width={15} height={15} /> Neue Recherche
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {modalOpen && <NewResearchModal onClose={() => setModalOpen(false)} onStart={startResearch} />}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o && !deleting) setDeleteId(null); }}>
        <AlertDialogContent className="sm:max-w-[420px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Recherche löschen
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteId
                ? `„${sessions.find((s) => s.id === deleteId)?.company ?? "Diese Recherche"}" wirklich löschen? Der Chat-Verlauf wird mitgelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
              disabled={deleting}
            >
              {deleting && <Spinner className="h-4 w-4 mr-2" />}
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
