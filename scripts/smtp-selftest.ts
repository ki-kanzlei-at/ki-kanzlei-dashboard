/* ── Live-Selbsttest des SMTP-Versands ──
 * Provisioniert ein echtes Ethereal-SMTP-Konto (nodemailer) und ruft
 * die ECHTEN Projekt-Funktionen testConnection() + sendEmail() auf.
 * Beweist End-to-End, dass der SMTP-Pfad (smtp.ts) wirklich verbindet
 * und versendet. Lauf:  npx tsx scripts/smtp-selftest.ts
 */
import nodemailer from "nodemailer";
import { sendEmail, testConnection } from "../src/lib/email/smtp";

async function main() {
  // 1) Echtes Wegwerf-SMTP-Konto holen (live)
  const acc = await nodemailer.createTestAccount();
  const creds = {
    host: acc.smtp.host,          // smtp.ethereal.email
    port: acc.smtp.port,          // 587
    username: acc.user,
    password: acc.pass,
    encryption: "tls" as const,   // STARTTLS auf 587
    senderEmail: acc.user,
    senderName: "KI Kanzlei Test",
  };
  console.log(`▶ Ethereal-Konto: ${acc.user} @ ${creds.host}:${creds.port}`);

  // 2) ECHTER Verbindungstest (gleiche Funktion wie der /test-Endpoint)
  const conn = await testConnection(creds);
  console.log("• testConnection():", conn);
  if (!conn.ok) { console.error("✗ Verbindungstest fehlgeschlagen"); process.exit(1); }

  // 3) ECHTER Versand (gleiche Funktion wie der Cron-Sender)
  await sendEmail(creds, {
    to: "empfaenger@example.com",
    subject: "SMTP Selbsttest ✔",
    htmlBody: "<h1>Funktioniert</h1><p>Versand über die echte smtp.ts-Pipeline.</p>",
    replyTo: "reply@ki-kanzlei.at",
  });
  console.log("• sendEmail(): OK — Nachricht angenommen vom SMTP-Server");

  // 4) Negativtest: falsches Passwort muss sauber als Fehler zurückkommen
  const bad = await testConnection({ ...creds, password: "definitiv-falsch" });
  console.log("• testConnection(falsches PW):", bad);
  if (bad.ok) { console.error("✗ Negativtest hätte fehlschlagen müssen"); process.exit(1); }

  console.log("\n✅ SMTP End-to-End verifiziert: verbinden, senden, Fehlerfall.");
}

main().catch((e) => { console.error("✗ Selbsttest-Fehler:", e); process.exit(1); });
