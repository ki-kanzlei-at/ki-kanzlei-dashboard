/* ── SMTP Auto-Detect: Server-Einstellungen aus E-Mail-Domain ableiten ── */

interface SmtpConfig {
  host: string;
  port: number;
  encryption: "tls" | "ssl";
  imap_host?: string;
  imap_port?: number;
}

/**
 * Bekannte Provider-Mappings (wie Lemlist Auto-Detect).
 */
const KNOWN_PROVIDERS: Record<string, SmtpConfig> = {
  // Google
  "gmail.com": { host: "smtp.gmail.com", port: 587, encryption: "tls", imap_host: "imap.gmail.com", imap_port: 993 },
  "googlemail.com": { host: "smtp.gmail.com", port: 587, encryption: "tls", imap_host: "imap.gmail.com", imap_port: 993 },
  // Microsoft
  "outlook.com": { host: "smtp.office365.com", port: 587, encryption: "tls", imap_host: "outlook.office365.com", imap_port: 993 },
  "outlook.de": { host: "smtp.office365.com", port: 587, encryption: "tls", imap_host: "outlook.office365.com", imap_port: 993 },
  "hotmail.com": { host: "smtp.office365.com", port: 587, encryption: "tls", imap_host: "outlook.office365.com", imap_port: 993 },
  "live.com": { host: "smtp.office365.com", port: 587, encryption: "tls", imap_host: "outlook.office365.com", imap_port: 993 },
  "live.de": { host: "smtp.office365.com", port: 587, encryption: "tls", imap_host: "outlook.office365.com", imap_port: 993 },
  // Yahoo
  "yahoo.com": { host: "smtp.mail.yahoo.com", port: 465, encryption: "ssl", imap_host: "imap.mail.yahoo.com", imap_port: 993 },
  "yahoo.de": { host: "smtp.mail.yahoo.com", port: 465, encryption: "ssl", imap_host: "imap.mail.yahoo.com", imap_port: 993 },
  // Zoho
  "zoho.com": { host: "smtp.zoho.com", port: 587, encryption: "tls", imap_host: "imap.zoho.com", imap_port: 993 },
  "zoho.eu": { host: "smtp.zoho.eu", port: 587, encryption: "tls", imap_host: "imap.zoho.eu", imap_port: 993 },
  // DACH Provider
  "gmx.de": { host: "mail.gmx.net", port: 587, encryption: "tls", imap_host: "imap.gmx.net", imap_port: 993 },
  "gmx.at": { host: "mail.gmx.net", port: 587, encryption: "tls", imap_host: "imap.gmx.net", imap_port: 993 },
  "gmx.net": { host: "mail.gmx.net", port: 587, encryption: "tls", imap_host: "imap.gmx.net", imap_port: 993 },
  "web.de": { host: "smtp.web.de", port: 587, encryption: "tls", imap_host: "imap.web.de", imap_port: 993 },
  "t-online.de": { host: "securesmtp.t-online.de", port: 587, encryption: "tls", imap_host: "secureimap.t-online.de", imap_port: 993 },
  "freenet.de": { host: "mx.freenet.de", port: 587, encryption: "tls", imap_host: "mx.freenet.de", imap_port: 993 },
  "posteo.de": { host: "posteo.de", port: 587, encryption: "tls", imap_host: "posteo.de", imap_port: 993 },
  "mailbox.org": { host: "smtp.mailbox.org", port: 587, encryption: "tls", imap_host: "imap.mailbox.org", imap_port: 993 },
  // Hosting Provider (DACH)
  "ionos.de": { host: "smtp.ionos.de", port: 587, encryption: "tls", imap_host: "imap.ionos.de", imap_port: 993 },
  "1und1.de": { host: "smtp.1und1.de", port: 587, encryption: "tls", imap_host: "imap.1und1.de", imap_port: 993 },
  "strato.de": { host: "smtp.strato.de", port: 465, encryption: "ssl", imap_host: "imap.strato.de", imap_port: 993 },
  "hetzner.com": { host: "mail.your-server.de", port: 587, encryption: "tls", imap_host: "mail.your-server.de", imap_port: 993 },
  // International
  "icloud.com": { host: "smtp.mail.me.com", port: 587, encryption: "tls", imap_host: "imap.mail.me.com", imap_port: 993 },
  "aol.com": { host: "smtp.aol.com", port: 587, encryption: "tls", imap_host: "imap.aol.com", imap_port: 993 },
  "protonmail.com": { host: "smtp.protonmail.ch", port: 587, encryption: "tls" },
  "proton.me": { host: "smtp.protonmail.ch", port: 587, encryption: "tls" },
  "fastmail.com": { host: "smtp.fastmail.com", port: 587, encryption: "tls", imap_host: "imap.fastmail.com", imap_port: 993 },
};

/**
 * Bekannte Hosting-Provider anhand MX-Records erkennen.
 */
const MX_PATTERNS: { pattern: RegExp; config: SmtpConfig }[] = [
  // Google Workspace
  { pattern: /google(mail)?\.com/i, config: { host: "smtp.gmail.com", port: 587, encryption: "tls" } },
  { pattern: /smtp\.google\.com/i, config: { host: "smtp.gmail.com", port: 587, encryption: "tls" } },
  // Microsoft 365
  { pattern: /outlook\.com|microsoft\.com|protection\.outlook/i, config: { host: "smtp.office365.com", port: 587, encryption: "tls" } },
  // Zoho
  { pattern: /zoho\.(com|eu)/i, config: { host: "smtp.zoho.eu", port: 587, encryption: "tls" } },
  // IONOS
  { pattern: /ionos\.(de|com)/i, config: { host: "smtp.ionos.de", port: 587, encryption: "tls" } },
  // Hetzner
  { pattern: /your-server\.de/i, config: { host: "mail.your-server.de", port: 587, encryption: "tls" } },
  // Strato
  { pattern: /strato\.(de|com)/i, config: { host: "smtp.strato.de", port: 465, encryption: "ssl" } },
  // All-Inkl
  { pattern: /all-inkl\.com|kasserver\.com/i, config: { host: "mail.DOMAIN", port: 587, encryption: "tls" } },
  // OVH
  { pattern: /ovh\.(net|com)/i, config: { host: "ssl0.ovh.net", port: 587, encryption: "tls" } },
  // Hostpoint
  { pattern: /hostpoint\.ch/i, config: { host: "asmtp.mail.hostpoint.ch", port: 587, encryption: "tls" } },
];

/**
 * Versucht SMTP-Einstellungen für eine E-Mail-Adresse automatisch zu erkennen.
 * 1. Bekannte Provider prüfen
 * 2. MX-Records analysieren (via DNS-over-HTTPS)
 * 3. Standard-Muster versuchen
 */
export async function autoDetectSmtp(email: string): Promise<SmtpConfig | null> {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return null;

  // 1. Direktes Lookup
  if (KNOWN_PROVIDERS[domain]) {
    return KNOWN_PROVIDERS[domain];
  }

  // 2. MX-Records prüfen
  try {
    const mxRecords = await queryMx(domain);
    for (const mx of mxRecords) {
      for (const { pattern, config } of MX_PATTERNS) {
        if (pattern.test(mx)) {
          return {
            ...config,
            host: config.host.replace("DOMAIN", domain),
          };
        }
      }
    }
  } catch {
    // MX lookup failed, continue with fallback
  }

  // 3. Fallback: Standard-SMTP-Pattern
  return {
    host: `smtp.${domain}`,
    port: 587,
    encryption: "tls",
  };
}

async function queryMx(domain: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.Answer || !Array.isArray(data.Answer)) return [];
    return data.Answer.map((a: { data?: string }) => a.data || "");
  } catch {
    return [];
  }
}

/**
 * Gibt den erkannten Provider-Namen zurück (für UI-Anzeige).
 */
export function detectProviderName(email: string): string | null {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return null;

  if (domain === "gmail.com" || domain === "googlemail.com") return "Google Gmail";
  if (domain.includes("outlook") || domain.includes("hotmail") || domain.includes("live")) return "Microsoft Outlook";
  if (domain.includes("yahoo")) return "Yahoo Mail";
  if (domain.includes("zoho")) return "Zoho Mail";
  if (domain.includes("gmx")) return "GMX";
  if (domain.includes("web.de")) return "WEB.DE";
  if (domain.includes("t-online")) return "T-Online";
  if (domain.includes("ionos") || domain.includes("1und1")) return "IONOS / 1&1";
  if (domain.includes("strato")) return "Strato";
  if (domain.includes("posteo")) return "Posteo";
  if (domain.includes("mailbox.org")) return "Mailbox.org";
  if (domain.includes("icloud") || domain.includes("me.com")) return "iCloud";
  if (domain.includes("proton")) return "Proton Mail";
  if (domain.includes("fastmail")) return "Fastmail";

  return null; // Custom domain
}
