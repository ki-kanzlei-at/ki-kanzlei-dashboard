/* ── Personalized campaign mail generator ──
 *
 * Erzeugt Subject + HTML-Body für eine einzelne Sequenz-Mail.
 * Nutzt Gemini wenn GOOGLE_API_KEY/GEMINI_API_KEY gesetzt — sonst
 * fallback auf einen sauberen Template-Renderer mit Platzhaltern.
 */

import type { Campaign, SequenceStep } from "@/types/campaigns";
import { isHtmlSignature, renderSignatureHtml, renderSignaturePlain } from "./signature";

export interface GeneratorLead {
  id: string;
  company: string | null;
  email: string | null;
  ceo_name: string | null;
  ceo_first_name?: string | null;
  ceo_last_name?: string | null;
  ceo_title?: string | null;
  ceo_gender?: string | null;
  city?: string | null;
  industry?: string | null;
  website?: string | null;
}

export interface GeneratedMail {
  subject: string;
  htmlBody: string;
  plainBody: string;
  generator: "gemini" | "template";
}

export async function generateCampaignMail(opts: {
  campaign: Campaign;
  step: SequenceStep;
  stepIndex: number;
  lead: GeneratorLead;
  senderName: string;
  signature?: string;
  trackingPixelUrl?: string | null;
  /** Wenn gesetzt: Abmeldelink (mailto) wird angehängt (DSGVO). */
  unsubscribeEmail?: string | null;
}): Promise<GeneratedMail> {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      return await generateViaGemini(opts, apiKey);
    } catch (err) {
      console.warn("[campaign-generator] Gemini fallback to template:", err);
    }
  }
  return generateViaTemplate(opts);
}

/* ───────────────────────────── Gemini ───────────────────────── */

async function generateViaGemini(
  opts: {
    campaign: Campaign;
    step: SequenceStep;
    stepIndex: number;
    lead: GeneratorLead;
    senderName: string;
    signature?: string;
    trackingPixelUrl?: string | null;
    unsubscribeEmail?: string | null;
  },
  apiKey: string,
): Promise<GeneratedMail> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.7,
      maxOutputTokens: 1024,
    },
  });

  const recipient = buildRecipientContext(opts.lead);
  const styleHints = TONE_HINTS[opts.campaign.tone] ?? TONE_HINTS.professional;
  const language = LANGUAGE_HINTS[opts.campaign.language] ?? LANGUAGE_HINTS["de-AT"];

  const prompt = `Du schreibst eine personalisierte Cold-Outreach-Mail.

# Kampagnen-Kontext (System-Prompt der/des Absender:in)
${(opts.campaign.system_prompt ?? "").trim() || "(keine spezifische Anweisung)"}

# Schritt in der Sequenz
- Position: Mail ${opts.stepIndex + 1} von ${opts.campaign.sequence_steps.length}
- Intent: ${opts.step.intent}
- Zielsetzung dieser Mail: ${opts.step.desc || "Keine besondere Vorgabe"}

# Empfänger:in
${recipient}

# Stil-Vorgaben
- Sprache: ${language}
- Tonalität: ${styleHints}
- Länge: 60–140 Wörter, keine Floskeln
- Keine Buzzwords (revolutionär, bahnbrechend, disruptiv, …)
- Keine Markdown-Symbole im Body
- Subject: max. 70 Zeichen, kein Klick-Bait
- Schreibe konkret und individuell — beziehe dich, wenn möglich, auf Branche/Standort

# Format
Antworte AUSSCHLIESSLICH mit validem JSON dieser Form:
{"subject": "…", "body": "Absatz1\\n\\nAbsatz2\\n\\nAbsatz3"}

Der Body darf KEINE Anrede oder Grußformel enthalten — die werden separat ergänzt.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  let parsed: { subject?: unknown; body?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : {};
  }

  const subject = typeof parsed.subject === "string" && parsed.subject.trim()
    ? parsed.subject.trim().slice(0, 200)
    : fallbackSubject(opts);
  const body = typeof parsed.body === "string" && parsed.body.trim()
    ? parsed.body.trim()
    : fallbackBody(opts);

  const { htmlBody, plainBody } = assembleMail(opts, body);
  return { subject, htmlBody, plainBody, generator: "gemini" };
}

/* ───────────────────────────── Template-Fallback ────────────── */

function generateViaTemplate(opts: {
  campaign: Campaign;
  step: SequenceStep;
  stepIndex: number;
  lead: GeneratorLead;
  senderName: string;
  signature?: string;
  trackingPixelUrl?: string | null;
  unsubscribeEmail?: string | null;
}): GeneratedMail {
  const subject = fallbackSubject(opts);
  const body = fallbackBody(opts);
  const { htmlBody, plainBody } = assembleMail(opts, body);
  return { subject, htmlBody, plainBody, generator: "template" };
}

/* ── Mail-Zusammenbau (Begrüßung + Body + Signatur + Abmeldelink) ──
 * Trennt Body (Plaintext → escaped) und Signatur (kann Rich-Text/HTML sein),
 * damit eine HTML-Signatur im HTML-Body korrekt gerendert wird und im
 * Text-Body als Plaintext erscheint. */
function assembleMail(
  opts: {
    campaign: Campaign;
    senderName: string;
    signature?: string;
    trackingPixelUrl?: string | null;
    unsubscribeEmail?: string | null;
    lead: GeneratorLead;
  },
  body: string,
): { htmlBody: string; plainBody: string } {
  const greeting = buildGreeting(opts.lead, opts.campaign.language);
  const bodyPlain = `${greeting}\n\n${body}`.trim();

  const sigPlain = signaturePlainText(opts);
  const plainCore = sigPlain ? `${bodyPlain}\n\n${sigPlain}` : bodyPlain;

  const unsubEmail = sanitizeEmail(opts.unsubscribeEmail);
  const plainBody = unsubEmail ? `${plainCore}\n\n${unsubPlainNote()}` : plainCore;

  const htmlBody = wrapHtml(bodyPlain, {
    signatureHtml: signatureHtmlFragment(opts),
    trackingPixelUrl: opts.trackingPixelUrl,
    unsubscribeEmail: unsubEmail,
  });
  return { htmlBody, plainBody };
}

function fallbackSubject(opts: {
  campaign: Campaign;
  step: SequenceStep;
  stepIndex: number;
  lead: GeneratorLead;
}): string {
  const company = (opts.lead.company || "").split(/[\s,]/)[0] || "Sie";
  const intent = opts.step.intent || "";
  if (opts.stepIndex === 0) return `Kurze Frage zu ${company}`;
  if (intent.toLowerCase().includes("follow")) return `Re: ${company}`;
  if (opts.stepIndex >= opts.campaign.sequence_steps.length - 1) return `Letzter Hinweis · ${company}`;
  return intent ? `${intent} · ${company}` : `Hallo ${company}`;
}

function fallbackBody(opts: {
  campaign: Campaign;
  step: SequenceStep;
  stepIndex: number;
  lead: GeneratorLead;
}): string {
  const company = opts.lead.company || "Ihre Kanzlei";
  const city = opts.lead.city || "Ihrer Region";
  const industry = opts.lead.industry || "Branche";
  const senderName = opts.campaign.sender_name || "Ihr Team";

  if (opts.stepIndex === 0) {
    return [
      `${company} ist mir aufgefallen — vor allem im Kontext von ${industry} in ${city}.`,
      `Bei vergleichbaren Unternehmen konnten wir mit unserer Lösung wiederkehrende Aufgaben spürbar verkürzen.`,
      `Hätten Sie kommende Woche 15 Minuten Zeit für einen kurzen Austausch?`,
      `${senderName}`,
    ].join("\n\n");
  }
  if (opts.stepIndex >= opts.campaign.sequence_steps.length - 1) {
    return [
      `Eine letzte kurze Nachricht: Falls das Thema bei ${company} aktuell nicht relevant ist, kein Problem — eine kurze Rückmeldung genügt.`,
      `Sollten Sie doch interessiert sein, reicht ein 15-Min.-Slot für einen ersten Eindruck.`,
    ].join("\n\n");
  }
  return [
    `Falls meine vorherige Nachricht untergegangen ist — kurzer Nachtrag:`,
    `Wir helfen ${industry}-Unternehmen, wiederkehrende Arbeit zu automatisieren und Vorbereitungszeit deutlich zu reduzieren.`,
    `Passt ein 15-minütiger Termin in der nächsten Woche?`,
  ].join("\n\n");
}

function buildRecipientContext(lead: GeneratorLead): string {
  const lines: string[] = [];
  if (lead.company) lines.push(`- Firma: ${lead.company}`);
  if (lead.ceo_name) lines.push(`- Ansprechperson: ${lead.ceo_name}${lead.ceo_title ? ` (${lead.ceo_title})` : ""}`);
  if (lead.industry) lines.push(`- Branche: ${lead.industry}`);
  if (lead.city) lines.push(`- Standort: ${lead.city}`);
  if (lead.website) lines.push(`- Website: ${lead.website}`);
  if (lines.length === 0) return "(keine zusätzlichen Empfänger-Daten verfügbar)";
  return lines.join("\n");
}

function buildGreeting(lead: GeneratorLead, language: string): string {
  const isFormal = !language.startsWith("en");
  if (!isFormal) {
    const first = lead.ceo_first_name || (lead.ceo_name ? lead.ceo_name.split(" ")[0] : "");
    return first ? `Hi ${first},` : "Hello,";
  }
  // Formal Deutsch
  if (!lead.ceo_name) return "Sehr geehrte Damen und Herren,";
  const gender = (lead.ceo_gender ?? "").toLowerCase();
  const lastName = lead.ceo_last_name
    || lead.ceo_name.replace(/^(Dr\.|Mag\.|Dipl\.-?Ing\.|Prof\.|MMag\.)\s*/i, "").split(" ").pop()
    || "";
  const title = lead.ceo_title ? `${lead.ceo_title} ` : "";
  if (gender === "frau" || gender === "weiblich") {
    return `Sehr geehrte Frau ${title}${lastName},`.trim();
  }
  if (gender === "herr" || gender === "männlich" || gender === "maennlich") {
    return `Sehr geehrter Herr ${title}${lastName},`.trim();
  }
  return `Sehr geehrte:r ${title}${lastName},`.trim();
}

/** Signatur als Plaintext (Text-Body). Fällt auf "Beste Grüße\nName" zurück. */
function signaturePlainText(opts: {
  campaign: Campaign;
  senderName: string;
  signature?: string;
}): string {
  if (opts.signature && opts.signature.trim()) {
    return renderSignaturePlain(opts.signature);
  }
  const closing = opts.campaign.language.startsWith("en") ? "Best regards" : "Beste Grüße";
  const name = opts.senderName || opts.campaign.sender_name || "";
  return `${closing}\n${name}`.trim();
}

/** Signatur als HTML-Fragment (HTML-Body). Plaintext-Fallback wird escaped. */
function signatureHtmlFragment(opts: {
  campaign: Campaign;
  senderName: string;
  signature?: string;
}): string {
  if (opts.signature && opts.signature.trim()) {
    if (isHtmlSignature(opts.signature)) return renderSignatureHtml(opts.signature);
    return escapeHtml(renderSignaturePlain(opts.signature)).replace(/\n/g, "<br/>");
  }
  return escapeHtml(signaturePlainText(opts)).replace(/\n/g, "<br/>");
}

function wrapHtml(
  plain: string,
  opts: { signatureHtml?: string; trackingPixelUrl?: string | null; unsubscribeEmail?: string | null },
): string {
  const paragraphs = plain
    .split(/\n{2,}/)
    .map((p) => p.split("\n").map(escapeHtml).join("<br/>"))
    .map((p) => `<p style="margin:0 0 12px;line-height:1.6">${p}</p>`)
    .join("");
  const signature = opts.signatureHtml
    ? `<div style="margin:16px 0 0;color:#334155">${opts.signatureHtml}</div>`
    : "";
  const pixel = opts.trackingPixelUrl
    ? `<img src="${opts.trackingPixelUrl}" width="1" height="1" alt="" style="display:none" />`
    : "";
  const unsub = opts.unsubscribeEmail
    ? `<p style="margin:18px 0 0;font-size:12px;color:#8a8a8a">Keine weiteren E-Mails gewünscht? `
      + `<a href="mailto:${opts.unsubscribeEmail}?subject=Abmelden" style="color:#8a8a8a;text-decoration:underline">Hier abmelden</a>.</p>`
    : "";
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.6">${paragraphs}${signature}${unsub}${pixel}</div>`;
}

/** Abmelde-Hinweis für den Plaintext-Teil (Reply-basiert). */
function unsubPlainNote(): string {
  return "—\nKeine weiteren E-Mails gewünscht? Antworten Sie kurz mit „Abmelden\".";
}

/** mailto-sichere E-Mail (entfernt Whitespace & gefährliche Zeichen). */
function sanitizeEmail(email?: string | null): string | null {
  if (!email) return null;
  const clean = email.replace(/[<>"'\s]/g, "").trim();
  return clean.includes("@") ? clean : null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const TONE_HINTS: Record<string, string> = {
  formal:       "Sehr förmlich, distanziert, Sie-Anrede",
  professional: "Professionell, freundlich, sachlich, Sie-Anrede",
  casual:       "Locker, persönlich aber respektvoll, Du-Anrede falls passend",
};

const LANGUAGE_HINTS: Record<string, string> = {
  "de-AT": "Deutsch (Österreich) — österreichische Begriffe wo passend",
  "de-DE": "Deutsch (Deutschland) — bundesdeutsche Sprache",
  "de-CH": "Deutsch (Schweiz)",
  "en":    "English (professional business)",
};
