/* ── Cron Job: GET /api/cron/email-warmup ──
 *
 * Täglicher Warmup-Schritt (lemwarm-Style Ramp-up):
 *  • Erhöht `warmup_day` für alle aktiven Konten mit aktivem Warmup um 1,
 *    solange das Warmup-Limit noch unter dem konfigurierten Tageslimit liegt.
 *  • Das effektive Sendelimit ergibt sich aus
 *      warmup_start + warmup_day × warmup_increment   (gedeckelt auf daily_limit)
 *    und wird beim Versand über getEffectiveDailyLimit()/pickNextAccount()
 *    durchgesetzt — diese Cron baut die Rampe nur Tag für Tag auf.
 *  • Health-Gating: Konten mit health_status "bad" werden übersprungen
 *    (Warmup pausiert, bis die Verbindung wieder funktioniert).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    /* ── Cron-Auth ── */
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getSupabaseAdmin();

    const { data, error } = await admin
      .from("email_accounts")
      .select("id, daily_limit, warmup_day, warmup_start, warmup_increment, health_status")
      .eq("warmup_enabled", true)
      .eq("is_active", true);

    if (error) {
      console.error("[Cron email-warmup] Konten laden:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const accounts = data ?? [];
    let advanced = 0; // Warmup-Tag erhöht
    let held = 0;     // wegen schlechter Health pausiert
    let maxed = 0;    // bereits bei Volllast

    for (const acc of accounts) {
      // Health-Gating: bei "bad" Warmup-Tag NICHT erhöhen.
      if (acc.health_status === "bad") { held++; continue; }

      const currentLimit = acc.warmup_start + (acc.warmup_day ?? 0) * acc.warmup_increment;
      // Volllast erreicht → Rampe abgeschlossen, nicht weiter erhöhen.
      if (currentLimit >= acc.daily_limit) { maxed++; continue; }

      await admin
        .from("email_accounts")
        .update({ warmup_day: (acc.warmup_day ?? 0) + 1 })
        .eq("id", acc.id);
      advanced++;
    }

    return NextResponse.json({
      message: "Warmup-Lauf abgeschlossen",
      total: accounts.length,
      advanced,
      held,
      maxed,
    });
  } catch (err) {
    console.error("[Cron email-warmup]", err);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
