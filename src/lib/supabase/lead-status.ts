/* ── Lead-Status-Sync aus der Kampagnen-Pipeline ──
 *
 * Pipeline-Events heben den Lead-Status an, stufen ihn aber NIE zurück —
 * manuelle Einstufungen (interested/not_interested/converted) bleiben erhalten:
 *
 *   new            → contacted   (erste E-Mail versendet)
 *   new/contacted  → interested  (Antwort eingegangen)
 *
 * Läuft mit dem Admin-Client (Cron/Webhooks haben keinen Auth-Kontext).
 * Gilt unabhängig vom Kampagnen-Status — auch Antworten auf abgeschlossene
 * Kampagnen ziehen den Lead-Status nach.
 */

import { getSupabaseAdmin } from "./admin";

/** Nach erfolgreichem Versand: Lead von „Neu" auf „Kontaktiert" heben. */
export async function markLeadContacted(leadId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("leads")
    .update({ status: "contacted", updated_at: new Date().toISOString() })
    .eq("id", leadId)
    .eq("status", "new");
  if (error) {
    console.error("[lead-status] markLeadContacted fehlgeschlagen:", error.message);
  }
}

/** Nach eingegangener Antwort: Leads auf „Interessiert" heben (upgrade-only). */
export async function markLeadsInterested(leadIds: string[]): Promise<void> {
  if (leadIds.length === 0) return;
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("leads")
    .update({ status: "interested", updated_at: new Date().toISOString() })
    .in("id", leadIds)
    .in("status", ["new", "contacted"]);
  if (error) {
    console.error("[lead-status] markLeadsInterested fehlgeschlagen:", error.message);
  }
}
