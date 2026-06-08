/* Inbox im UI testbar machen: eine eingehende Antwort einspielen oder zurücksetzen.
 *   npx tsx scripts/inbox-demo.ts seed     → Test-Antwort von Michael Grupp einspielen (erscheint in der Inbox)
 *   npx tsx scripts/inbox-demo.ts reset    → Test-Antwort entfernen, Inbox wieder leer
 * Danach im Browser: /dashboard/inbox
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const BASE = "http://localhost:3000";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const PROFILE_ID = "michael-grupp";            // gesendeter Invite-Kontakt
const LEAD_ID = "0c88a31d-b86c-41d7-94f7-0c13bbb05375";
const EXT = "demo-reply-1";

async function seed() {
  const res = await fetch(`${BASE}/api/linkedin/webhook`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "message.received",
      data: {
        sender: { profileId: PROFILE_ID, name: "Michael Grupp" },
        body: "Hallo Markus, danke für die Anfrage! Klingt spannend – erzähl gern mehr über KI Kanzlei. Hast du nächste Woche 15 Min.?",
        messageId: EXT, conversationUrn: "urn:li:conversation:demo-mg",
      },
    }),
  });
  const j = await res.json();
  console.log(res.ok && j.matched === 1
    ? "✅ Test-Antwort eingespielt. Jetzt öffnen: /dashboard/inbox"
    : `❌ Fehlgeschlagen: ${JSON.stringify(j)} (läuft der Dev-Server? ALLOW_UNSIGNED_WEBHOOKS=true gesetzt?)`);
}

async function reset() {
  await admin.from("inbox_messages").delete().eq("external_id", EXT);
  await admin.from("inbox_conversations").update({ has_inbound: false, unread: false, starred: false, status: "new", snoozed_until: null, last_snippet: null }).eq("linkedin_lead_id", LEAD_ID);
  await admin.from("linkedin_leads").update({ status: "invited", last_message_at: null }).eq("id", LEAD_ID);
  console.log("✅ Zurückgesetzt — Inbox wieder leer.");
}

const cmd = process.argv[2] || "seed";
(cmd === "reset" ? reset() : seed()).then(() => process.exit(0)).catch((e) => { console.error("FATAL", e); process.exit(1); });
