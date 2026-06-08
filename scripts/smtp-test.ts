/* SMTP-Gate testen: Verbindung prüfen + optional echte Test-Mail senden.
 *   npx tsx scripts/smtp-test.ts                       → neuestes aktives SMTP-Konto verbinden & verifizieren
 *   npx tsx scripts/smtp-test.ts --send                → + Test-Mail an die eigene Absenderadresse
 *   npx tsx scripts/smtp-test.ts --send max@kunde.de   → + Test-Mail an diese Adresse
 *   npx tsx scripts/smtp-test.ts --account du@gmail.com [--send ...]  → bestimmtes Konto wählen
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { testConnection, sendEmail } from "../src/lib/email/smtp";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const sendIdx = args.indexOf("--send");
const doSend = sendIdx !== -1;
const sendTo = doSend ? args[sendIdx + 1] && !args[sendIdx + 1].startsWith("--") ? args[sendIdx + 1] : "" : "";
const accIdx = args.indexOf("--account");
const wantAccount = accIdx !== -1 ? args[accIdx + 1] : "";

async function main() {
  let q = admin.from("email_accounts").select("*").eq("provider", "smtp").eq("is_active", true);
  if (wantAccount) q = q.eq("sender_email", wantAccount);
  const { data: accts, error } = await q.order("created_at", { ascending: false }).limit(1);
  if (error) { console.error("DB-Fehler:", error.message); process.exit(1); }
  const a = accts?.[0];
  if (!a) { console.log("❌ Kein aktives SMTP-Konto gefunden. Bitte erst unter Einstellungen → E-Mail-Konten verbinden."); process.exit(1); }

  const creds = {
    host: a.smtp_host, port: a.smtp_port || 587,
    username: a.smtp_username, password: a.smtp_password,
    encryption: (a.smtp_encryption || "tls") as "tls" | "ssl" | "none",
    senderEmail: a.sender_email, senderName: a.sender_name || undefined,
  };
  console.log(`▶ Konto: ${a.label || a.sender_email}  (${a.sender_email})`);
  console.log(`  Host ${creds.host}:${creds.port} · ${creds.encryption} · User ${creds.username}`);

  console.log("\n🔌 Verbindung prüfen (transport.verify) …");
  const res = await testConnection(creds);
  console.log(res.ok ? "✅ SMTP-Verbindung OK — Gate funktioniert." : `❌ Verbindung fehlgeschlagen: ${res.error}`);
  if (!res.ok) process.exit(1);

  if (doSend) {
    const to = sendTo || a.sender_email;
    console.log(`\n📤 Sende Test-Mail an ${to} …`);
    try {
      await sendEmail(creds, {
        to,
        subject: "KI Kanzlei — SMTP-Gate-Test ✅",
        htmlBody: `<p>Hallo,</p><p>das ist eine <b>Test-Mail</b> über das verbundene SMTP-Gate (${creds.host}).</p><p>Wenn diese Mail ankommt, funktioniert der Outreach-Versand über dieses Konto.</p><p>– KI Kanzlei</p>`,
      });
      console.log(`✅ Gesendet. Prüfe den Posteingang von ${to}.`);
    } catch (e) {
      console.log(`❌ Versand fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
      process.exit(1);
    }
  } else {
    console.log("\nℹ️  Mit --send eine echte Test-Mail verschicken (Standard: an die eigene Adresse).");
  }
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
