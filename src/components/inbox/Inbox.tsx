"use client";

/* ── Inbox — unified LinkedIn + E-Mail conversation view ──
 * 1:1-Port aus Claude-Design „Inbox.html" (inbox-app.jsx) in natives TSX.
 * Lebt im Dashboard-Shell (Sidebar + Header); Styles in ./inbox.css (.inbox-root).
 */

import {
  useState, useMemo, useEffect, useRef, useLayoutEffect, useCallback,
  type SVGProps, type ReactElement, type ReactNode,
} from "react";
import { toast } from "sonner";

/* ── Icons ─────────────────────────────────────────────────────────────── */
type Ico = (p: SVGProps<SVGSVGElement>) => ReactElement;
const I: Record<string, Ico> = {
  inbox:     (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 13h5l1 3h6l1-3h5M3 13l3-8h12l3 8v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6Z"/></svg>,
  users:     (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>,
  calendar:  (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>,
  message:   (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 11.5a8.5 8.5 0 0 1-12.2 7.7L3 21l1.8-5.8A8.5 8.5 0 1 1 21 11.5Z"/></svg>,
  pipeline:  (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="12" rx="1"/><rect x="17" y="4" width="5" height="8" rx="1"/></svg>,
  send:      (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m22 2-7 20-4-9-9-4 20-7Z"/></svg>,
  linkedin:  (p) => <svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.95v5.66H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45Z"/></svg>,
  spark:     (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>,
  doc:       (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>,
  dots:      (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}><circle cx="5" cy="12" r=".9"/><circle cx="12" cy="12" r=".9"/><circle cx="19" cy="12" r=".9"/></svg>,
  search:    (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>,
  x:         (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M18 6 6 18M6 6l12 12"/></svg>,
  mail:      (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>,
  refresh:   (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 12a9 9 0 0 1-9 9c-2.4 0-4.6-.9-6.2-2.5L3 16"/><path d="M3 12a9 9 0 0 1 9-9c2.4 0 4.6.9 6.2 2.5L21 8M21 3v5h-5M3 21v-5h5"/></svg>,
  check:     (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m4 12 5 5 11-12"/></svg>,
  star:      (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.8 6.6 20l1-6.1L3.2 9.5l6.1-.9L12 3Z"/></svg>,
  reply:     (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M9 17 4 12l5-5M4 12h11a5 5 0 0 1 5 5v3"/></svg>,
  clock:     (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  mailOpen:  (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 9.5 12 3l9 6.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.5Z"/><path d="m3 9.5 9 6 9-6"/></svg>,
  pin:       (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M9 4h6l-1 6 4 3v2h-5v5l-1 1-1-1v-5H6v-2l4-3-1-6Z"/></svg>,
  archive:   (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4"/></svg>,
  ban:       (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/></svg>,
  paperclip: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m21.4 11-8.9 8.9a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 1 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"/></svg>,
  chevron:   (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m6 9 6 6 6-6"/></svg>,
};

function avatarColor(s: string): string { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return `oklch(0.6 0.14 ${h})`; }
const initials = (n: string) => n.replace(/^(Dr\.|Mag\.|Mag\.\(FH\))\s*/, "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

/* ── Types ─────────────────────────────────────────────────────────────── */
type Channel = "email" | "linkedin";
type StatusKey = "meeting" | "interested" | "question" | "new" | "declined";
type Msg = { from: "me" | "them"; t: string; subject?: string; text: string };
type Conv = {
  id: string; channel: Channel; name: string; company: string; role: string;
  campaign: string; status: StatusKey; unread: boolean; starred: boolean; time: string; day: string;
  subject?: string; messages: Msg[]; done?: boolean; snoozed?: string;
  avatarUrl?: string | null; contactEmail?: string | null; linkedinUrl?: string | null;
};
type Me = { name: string; mailbox: string };

/* ── Mapping: API-Thread → UI-Conv (relative Zeit + Tagesgruppe) ───────────── */
function relTime(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const min = Math.round((Date.now() - then) / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `${min} Min.`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} Std.`;
  const d = Math.round(h / 24);
  if (d === 1) return "gestern";
  if (d < 7) return `vor ${d} Tagen`;
  if (d < 14) return "vor 1 Woche";
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function dayGroup(iso: string | null): string {
  if (!iso) return "Älter";
  const d = new Date(iso);
  const now = new Date();
  const sod = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((sod(now) - sod(d)) / 86400000);
  if (days <= 0) return "Heute";
  if (days === 1) return "Gestern";
  if (days < 7) return "Diese Woche";
  return "Älter";
}

type ApiMsg = { direction: "out" | "in"; subject: string | null; body: string; sent_at: string };
type ApiThread = {
  id: string; channel: Channel; contact_name: string; contact_company: string | null;
  contact_role: string | null; contact_email: string | null; linkedin_url: string | null;
  avatar_url: string | null; campaign_name: string | null; status: StatusKey;
  unread: boolean; starred: boolean; done: boolean; snoozed_until: string | null;
  last_message_at: string; messages: ApiMsg[];
};

function threadToConv(t: ApiThread): Conv {
  const messages: Msg[] = (t.messages || []).map((m) => ({
    from: m.direction === "out" ? "me" : "them",
    t: relTime(m.sent_at),
    subject: m.subject || undefined,
    text: m.body,
  }));
  const lastSubject = [...(t.messages || [])].reverse().find((m) => m.subject)?.subject || undefined;
  return {
    id: t.id, channel: t.channel,
    name: t.contact_name || "Unbekannt",
    company: t.contact_company || "",
    role: t.contact_role || "",
    campaign: t.campaign_name || "",
    status: t.status, unread: t.unread, starred: t.starred,
    time: relTime(t.last_message_at), day: dayGroup(t.last_message_at),
    subject: lastSubject, messages,
    done: t.done,
    snoozed: t.snoozed_until ? "Erinnerung gesetzt" : undefined,
    avatarUrl: t.avatar_url, contactEmail: t.contact_email, linkedinUrl: t.linkedin_url,
  };
}


const STATUS: Record<StatusKey, { label: string; cls: string }> = {
  meeting:    { label: "Termin",            cls: "st-meeting" },
  interested: { label: "Interessiert",      cls: "st-interested" },
  question:   { label: "Rückfrage",         cls: "st-question" },
  new:        { label: "Neu",               cls: "st-new" },
  declined:   { label: "Nicht interessiert", cls: "st-declined" },
};

function StatusBadge({ status }: { status: StatusKey }) {
  const s = STATUS[status]; if (!s) return null;
  return <span className={`badge-status ${s.cls}`}><span className="dot" />{s.label}</span>;
}

function ChannelChip({ channel, className = "" }: { channel: Channel; className?: string }) {
  return (
    <span className={`conv-chip is-${channel} ${className}`}>
      {channel === "linkedin" ? <I.linkedin /> : <I.mail />}
    </span>
  );
}

function Avatar({ name, channel }: { name: string; channel: Channel }) {
  return (
    <div className="conv-avatar">
      <div className="ph" style={{ background: avatarColor(name) }}>{initials(name)}</div>
      <ChannelChip channel={channel} />
    </div>
  );
}

/* ── Dropdown menu (fixed-positioned so it never clips inside scroll areas) ─ */
type MenuItem = { sep?: boolean; icon?: Ico; label?: string; danger?: boolean; right?: string; onClick?: () => void };
type MenuPos = { right: number; top: number; tTop: number };

function Menu({ items, trigger, width = 210 }: { items: MenuItem[]; trigger: (toggle: (e: React.MouseEvent) => void, open: boolean) => ReactNode; width?: number }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function toggle(e: React.MouseEvent) {
    if (open) { setOpen(false); return; }
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ right: window.innerWidth - r.right, top: r.bottom + 6, tTop: r.top });
    setOpen(true);
  }
  useLayoutEffect(() => {
    if (!open || !menuRef.current) return;
    const h = menuRef.current.offsetHeight;
    setPos((p) => (p && p.top + h > window.innerHeight - 10) ? { ...p, top: Math.max(10, p.tTop - 6 - h) } : p);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); }
    function onEsc(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onEsc); };
  }, [open]);

  return (
    <span className="menu-wrap" ref={wrapRef}>
      {trigger(toggle, open)}
      {open && pos && (
        <div ref={menuRef} className="menu inbox-menu" style={{ position: "fixed", right: pos.right, top: pos.top, minWidth: width }} onClick={(e) => e.stopPropagation()}>
          {items.map((it, i) => {
            if (it.sep) return <div key={i} className="menu-sep" />;
            const Ic = it.icon;
            return (
              <button key={i} className={`menu-item ${it.danger ? "is-danger" : ""}`} onClick={() => { setOpen(false); if (it.onClick) it.onClick(); }}>
                {Ic && <Ic />}<span>{it.label}</span>{it.right && <span className="menu-right">{it.right}</span>}
              </button>
            );
          })}
        </div>
      )}
    </span>
  );
}

/* ── Conversation row ──────────────────────────────────────────────────── */
type RowHandlers = {
  onToggleStar: (id: string) => void;
  onMarkUnread: (id: string) => void;
  onMarkRead: (id: string) => void;
  onSnooze: (id: string) => void;
  onDone: (id: string, val: boolean) => void;
  onOptOut: (id: string) => void;
};

function ConvRow({ c, active, onClick, onToggleStar, onMarkUnread, onMarkRead, onSnooze, onDone, onOptOut }: RowHandlers & { c: Conv; active: boolean; onClick: () => void }) {
  const last = c.messages[c.messages.length - 1];
  const snippet = (last.from === "me" ? "Du: " : "") + last.text.replace(/\n+/g, " ");
  const rowMenu: MenuItem[] = [
    { label: c.unread ? "Als gelesen markieren" : "Als ungelesen markieren", icon: c.unread ? I.mailOpen : I.mail, onClick: () => (c.unread ? onMarkRead(c.id) : onMarkUnread(c.id)) },
    { label: c.starred ? "Markierung entfernen" : "Markieren", icon: I.pin, onClick: () => onToggleStar(c.id) },
    { label: "Später erinnern", icon: I.clock, right: "morgen", onClick: () => onSnooze(c.id) },
    { label: c.done ? "Wiederherstellen" : "Erledigt", icon: c.done ? I.archive : I.check, onClick: () => onDone(c.id, !c.done) },
    { sep: true },
    { label: "Kontakt abmelden", icon: I.ban, danger: true, onClick: () => onOptOut(c.id) },
  ];
  return (
    <div className={`conv ${active ? "is-active" : ""} ${c.unread ? "is-unread" : ""}`} onClick={onClick}>
      <Avatar name={c.name} channel={c.channel} />
      <div className="conv-main">
        <div className="conv-top">
          <span className="conv-name">{c.name}</span>
          {c.starred && <I.star className="conv-star" width="12" height="12" />}
          <span className="conv-time">{c.time}</span>
        </div>
        <div className="conv-sub">{c.company}</div>
        <div className="conv-snippet">{c.channel === "email" && c.subject ? c.subject + " — " : ""}{snippet}</div>
        <div className="conv-foot">
          <StatusBadge status={c.status} />
          {c.snoozed && <span className="snooze-chip"><I.clock width="11" height="11" />{c.snoozed}</span>}
          <span className="conv-actions">
            <Menu items={rowMenu} trigger={(toggle) => (
              <button className="icon-btn icon-btn-sm" title="Aktionen" onClick={(e) => { e.stopPropagation(); toggle(e); }}><I.dots width="15" height="15" /></button>
            )} />
          </span>
        </div>
      </div>
      {c.unread && <span className="conv-unread-dot" />}
    </div>
  );
}

/* ── Message ───────────────────────────────────────────────────────────── */
function Message({ m, conv, self }: { m: Msg; conv: Conv; self: Me }) {
  const isMe = m.from === "me";
  const who = isMe ? self.name : conv.name;
  return (
    <div className={`msg ${isMe ? "is-me" : ""}`}>
      <div className="msg-avatar" style={{ background: isMe ? "var(--primary)" : avatarColor(conv.name) }}>
        {isMe ? initials(self.name) : initials(conv.name)}
      </div>
      <div className="msg-col">
        <div className="msg-meta">
          <span className="who">{who}</span>
          <span className="when">{m.t}</span>
        </div>
        {m.subject && <div className="msg-subject">{m.subject}</div>}
        <div className="msg-bubble">{m.text}</div>
        <div className="msg-channel-note">
          {conv.channel === "linkedin" ? <><I.linkedin /> via LinkedIn</> : <><I.mail /> via E-Mail{self.mailbox ? ` · ${self.mailbox}` : ""}</>}
        </div>
      </div>
    </div>
  );
}

/* ── Thread ────────────────────────────────────────────────────────────── */
function Thread({ conv, self, onSend, onToggleStar, onMarkUnread, onMarkRead, onSnooze, onDone, onOptOut }: RowHandlers & { conv: Conv | null; self: Me; onSend: (id: string, payload: { text: string; subject: string | null }) => void }) {
  // Composer-State wird pro Konversation zurückgesetzt, indem <Thread> mit key={conv.id}
  // neu gemountet wird → kein setState-in-effect nötig (lazy Initializer reicht).
  const [draft, setDraft] = useState("");
  const [subject, setSubject] = useState(() => conv && conv.channel === "email" ? "Re: " + (conv.subject ? conv.subject.replace(/^Re:\s*/i, "") : "") : "");
  const [showCc, setShowCc] = useState(false);
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const msgCount = conv ? conv.messages.length : 0;

  // Beim Mount (neue Konversation) und bei neuen Nachrichten ans Ende scrollen.
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [msgCount]);
  useLayoutEffect(() => { const ta = taRef.current; if (ta) { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 200) + "px"; } }, [draft]);

  if (!conv) {
    return (
      <section className="thread">
        <div className="thread-empty">
          <div className="ico"><I.inbox /></div>
          <h3>Keine Konversation ausgewählt</h3>
          <p>Wähle links eine Nachricht aus, um den Verlauf zu sehen und zu antworten.</p>
        </div>
      </section>
    );
  }

  const isLi = conv.channel === "linkedin";
  function autoGrow(e: React.ChangeEvent<HTMLTextAreaElement>) { setDraft(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px"; }
  function handleSend() {
    const text = draft.trim(); if (!text || !conv) return;
    onSend(conv.id, { text, subject: isLi ? null : subject.trim() });
    setDraft(""); requestAnimationFrame(() => { if (taRef.current) taRef.current.style.height = "auto"; });
  }

  const headerMenu: MenuItem[] = [
    { label: conv.unread ? "Als gelesen markieren" : "Als ungelesen markieren", icon: conv.unread ? I.mailOpen : I.mail, onClick: () => (conv.unread ? onMarkRead(conv.id) : onMarkUnread(conv.id)) },
    { label: conv.starred ? "Markierung entfernen" : "Markieren", icon: I.pin, onClick: () => onToggleStar(conv.id) },
    { label: "Später erinnern", icon: I.clock, right: "morgen", onClick: () => onSnooze(conv.id) },
    { sep: true },
    { label: "In Pipeline verschieben", icon: I.pipeline, onClick: () => {} },
    { label: "Zu Kampagne hinzufügen", icon: I.send, onClick: () => {} },
    { label: conv.done ? "Wiederherstellen" : "Konversation archivieren", icon: I.archive, onClick: () => onDone(conv.id, !conv.done) },
    { sep: true },
    { label: "Kontakt abmelden", icon: I.ban, danger: true, onClick: () => onOptOut(conv.id) },
  ];

  return (
    <section className="thread">
      <div className="thread-head">
        <Avatar name={conv.name} channel={conv.channel} />
        <div className="thread-head-info">
          <div className="thread-head-name">
            <span className="nm">{conv.name}</span>
            <StatusBadge status={conv.status} />
          </div>
          <div className="thread-head-sub">
            <span>{conv.role} · {conv.company}</span>
            <span className="dot" />
            <span className={`chan-tag is-${conv.channel}`}>{isLi ? <I.linkedin /> : <I.mail />}{isLi ? "LinkedIn" : "E-Mail"}</span>
            <span className="dot" />
            <span className="camp-tag"><I.send />{conv.campaign}</span>
          </div>
        </div>
        <div className="thread-head-actions">
          <button className="icon-btn icon-btn-sm" title={conv.starred ? "Markierung entfernen" : "Markieren"} onClick={() => onToggleStar(conv.id)}>
            <I.star width="15" height="15" style={{ fill: conv.starred ? "var(--warning)" : "none", color: conv.starred ? "var(--warning)" : "currentColor" }} />
          </button>
          <button className="btn btn-outline btn-sm" title="Termin vereinbaren"><I.calendar width="13" height="13" /> <span className="btn-lbl">Termin</span></button>
          <button className="btn btn-outline btn-sm" title="Im CRM öffnen"><I.users width="13" height="13" /> <span className="btn-lbl">Im CRM</span></button>
          <button className="btn btn-outline btn-sm" title="Als erledigt markieren" onClick={() => onDone(conv.id, true)}><I.check width="14" height="14" /> <span className="btn-lbl">Erledigt</span></button>
          <Menu width={232} items={headerMenu} trigger={(toggle) => (
            <button className="icon-btn icon-btn-sm" title="Mehr" onClick={toggle}><I.dots width="15" height="15" /></button>
          )} />
        </div>
      </div>

      <div className="thread-body" ref={bodyRef}>
        <div className="thread-inner">
          <div className="thread-daysep"><span>{conv.day}</span></div>
          {conv.messages.map((m, i) => <Message key={i} m={m} conv={conv} self={self} />)}
        </div>
      </div>

      <div className="composer">
        <div className="composer-inner">
          <div className="composer-context">
            <I.reply />
            Antwort an <b>{conv.name}</b> · {isLi ? <>via <b>LinkedIn</b></> : <>via <b>E-Mail</b>{self.mailbox ? ` (${self.mailbox})` : ""}</>}
          </div>
          <div className="composer-box">
            {!isLi && (
              <div className="composer-head">
                <div className="composer-field">
                  <span className="k">Betreff</span>
                  <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Betreff der Antwort" />
                  {!showCc && <button className="cc-toggle" onClick={() => setShowCc(true)}>Cc / Bcc</button>}
                </div>
                {showCc && (
                  <div className="composer-field">
                    <span className="k">Cc</span>
                    <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="kopie@kanzlei.at" />
                  </div>
                )}
                {showCc && (
                  <div className="composer-field">
                    <span className="k">Bcc</span>
                    <input value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="blindkopie@kanzlei.at" />
                  </div>
                )}
              </div>
            )}
            <textarea
              ref={taRef}
              value={draft}
              onChange={autoGrow}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSend(); }}
              placeholder={isLi ? "LinkedIn-Nachricht schreiben …" : "E-Mail-Antwort schreiben …"}
            />
            <div className="composer-actions">
              <button className="icon-btn icon-btn-sm" title="Datei anhängen"><I.paperclip width="15" height="15" /></button>
              <span className="spacer" />
              <span className="composer-hint">⌘↵ zum Senden</span>
              <button className={`btn btn-sm ${isLi ? "btn-li" : "btn-default"}`} onClick={handleSend} disabled={!draft.trim()}>
                <I.send width="13" height="13" /> {isLi ? "Via LinkedIn" : "Via E-Mail"} senden
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Skeletons ─────────────────────────────────────────────────────────── */
function ListSkeleton() {
  return (
    <>
      {Array.from({ length: 7 }).map((_, i) => (
        <div className="skel-row" key={i}>
          <div className="skel skel-av" />
          <div className="skel-lines">
            <div className="skel skel-line" style={{ width: "55%" }} />
            <div className="skel skel-line" style={{ width: "38%" }} />
            <div className="skel skel-line" style={{ width: "85%" }} />
          </div>
        </div>
      ))}
    </>
  );
}

function ThreadSkeleton() {
  return (
    <section className="thread skel-thread">
      <div className="skel-thread-head">
        <div className="skel skel-av" style={{ width: 38, height: 38 }} />
        <div className="skel-lines" style={{ flex: 1 }}>
          <div className="skel skel-line" style={{ width: 180 }} />
          <div className="skel skel-line" style={{ width: 240 }} />
        </div>
      </div>
      <div className="skel-thread-body">
        <div className="skel skel-bubble" style={{ width: "60%" }} />
        <div className="skel skel-bubble is-me" style={{ width: "55%" }} />
        <div className="skel skel-bubble" style={{ width: "48%" }} />
      </div>
    </section>
  );
}

/* ── Inbox (App) ───────────────────────────────────────────────────────── */
export function Inbox() {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [me, setMe] = useState<Me>({ name: "Ich", mailbox: "" });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread" | "email" | "linkedin" | "done">("all");
  const [query, setQuery] = useState("");
  const [selId, setSelId] = useState<string | null>(null);

  const load = useCallback(async (keepSel = true) => {
    try {
      const res = await fetch("/api/inbox");
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Laden fehlgeschlagen");
      const threads = (j.data as ApiThread[]).map(threadToConv);
      setConvs(threads);
      if (j.me) setMe(j.me as Me);
      setSelId((cur) => (keepSel && cur && threads.some((t) => t.id === cur)) ? cur : (threads.find((t) => !t.done)?.id ?? null));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Inbox konnte nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const live = convs.filter((c) => !c.done);
    return {
      all: live.length,
      unread: live.filter((c) => c.unread).length,
      email: live.filter((c) => c.channel === "email").length,
      linkedin: live.filter((c) => c.channel === "linkedin").length,
      done: convs.filter((c) => c.done).length,
    };
  }, [convs]);

  const filtered = useMemo(() => convs.filter((c) => {
    if (filter === "done") { if (!c.done) return false; }
    else {
      if (c.done) return false;
      if (filter === "unread" && !c.unread) return false;
      if (filter === "email" && c.channel !== "email") return false;
      if (filter === "linkedin" && c.channel !== "linkedin") return false;
    }
    if (query) {
      const q = query.toLowerCase();
      if (!(c.name.toLowerCase().includes(q) || c.company.toLowerCase().includes(q) || (c.campaign || "").toLowerCase().includes(q))) return false;
    }
    return true;
  }), [convs, filter, query]);

  const selected = convs.find((c) => c.id === selId) || null;

  // Optimistisch lokal aktualisieren + serverseitig persistieren.
  function persist(id: string, body: Record<string, unknown>) {
    fetch(`/api/inbox/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
  }
  function openConv(id: string) {
    setSelId(id);
    setConvs((cs) => cs.map((c) => {
      if (c.id !== id || !c.unread) return c;
      persist(id, { unread: false });
      return { ...c, unread: false };
    }));
  }
  async function sendReply(id: string, payload: { text: string; subject: string | null }) {
    setConvs((cs) => cs.map((c) => c.id === id
      ? { ...c, messages: [...c.messages, { from: "me", t: "gerade eben", text: payload.text, subject: payload.subject || undefined }], time: "gerade eben" }
      : c));
    try {
      const res = await fetch(`/api/inbox/${id}/reply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Senden fehlgeschlagen");
      toast.success("Nachricht gesendet");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Senden fehlgeschlagen");
      load(); // Server-Wahrheit wiederherstellen
    }
  }
  function toggleStar(id: string) {
    setConvs((cs) => cs.map((c) => { if (c.id !== id) return c; persist(id, { starred: !c.starred }); return { ...c, starred: !c.starred }; }));
  }
  function markUnread(id: string) { setConvs((cs) => cs.map((c) => c.id === id ? { ...c, unread: true } : c)); persist(id, { unread: true }); }
  function markRead(id: string)   { setConvs((cs) => cs.map((c) => c.id === id ? { ...c, unread: false } : c)); persist(id, { unread: false }); }
  function snooze(id: string)     {
    const until = new Date(Date.now() + 86400000).toISOString();
    setConvs((cs) => cs.map((c) => c.id === id ? { ...c, snoozed: "Erinnerung gesetzt" } : c)); persist(id, { snoozed_until: until });
  }
  function optOut(id: string)     { setConvs((cs) => cs.map((c) => c.id === id ? { ...c, status: "declined", unread: false } : c)); persist(id, { status: "declined", unread: false }); }
  function setDone(id: string, val: boolean) {
    setConvs((cs) => cs.map((c) => c.id === id ? { ...c, done: val, unread: val ? false : c.unread } : c));
    persist(id, { done: val });
    if (val && id === selId) {
      const next = convs.find((c) => !c.done && c.id !== id);
      setSelId(next ? next.id : null);
    }
  }

  const FILTERS: { v: typeof filter; label: string; icon: Ico | null; n: number }[] = [
    { v: "all",      label: "Alle",      icon: null,        n: counts.all },
    { v: "unread",   label: "Ungelesen", icon: null,        n: counts.unread },
    { v: "email",    label: "E-Mail",    icon: I.mail,      n: counts.email },
    { v: "linkedin", label: "LinkedIn",  icon: I.linkedin,  n: counts.linkedin },
    { v: "done",     label: "Erledigt",  icon: I.check,     n: counts.done },
  ];

  return (
    <div className="inbox-root" data-screen-label="Inbox">
      <div className="inbox">
        <div className="inbox-list">
          <div className="inbox-list-head">
            <div className="inbox-title-row">
              <span className="inbox-title">Posteingang</span>
              {counts.unread > 0 && <span className="count-pill">{counts.unread} neu</span>}
              <span className="spacer" />
              <button className="icon-btn icon-btn-sm" title="Aktualisieren" onClick={() => load()}><I.refresh width="15" height="15" /></button>
            </div>
            <div className="input input-sm inbox-search">
              <I.search className="lead-ico" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, Firma oder Kampagne …" />
              {query && <button className="icon-btn icon-btn-sm" onClick={() => setQuery("")}><I.x width="13" height="13" /></button>}
            </div>
            <div className="inbox-filters">
              {FILTERS.map((f) => {
                const Ic = f.icon;
                return (
                  <button key={f.v} className={`inbox-filter ${filter === f.v ? "is-active" : ""}`} onClick={() => setFilter(f.v)}>
                    {Ic && <Ic />}{f.label}<span className="n">{f.n}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="inbox-rows">
            {loading
              ? <ListSkeleton />
              : filtered.length === 0
                ? <div className="inbox-empty-list">Keine Nachrichten in diesem Filter.</div>
                : filtered.map((c) => <ConvRow key={c.id} c={c} active={c.id === selId} onClick={() => openConv(c.id)}
                    onToggleStar={toggleStar} onMarkUnread={markUnread} onMarkRead={markRead} onSnooze={snooze} onDone={setDone} onOptOut={optOut} />)
            }
          </div>
        </div>

        {loading
          ? <ThreadSkeleton />
          : <Thread key={selected ? selected.id : "empty"} conv={selected} self={me} onSend={sendReply} onToggleStar={toggleStar} onMarkUnread={markUnread} onMarkRead={markRead} onSnooze={snooze} onDone={setDone} onOptOut={optOut} />}
      </div>
    </div>
  );
}
