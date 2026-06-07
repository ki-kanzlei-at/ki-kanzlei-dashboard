/* ── Integration-OAuth-Tokens: speichern + automatisch refreshen ──
 * Multi-Tenant SaaS: EINE OAuth-App pro Anbieter (ENV-Creds), Token pro Kunde.
 * Tokens liegen in user_settings.integration_tokens (jsonb), zusätzlich wird
 * der Access-Token in der Legacy-Spalte (hubspot_api_key …) gespiegelt, damit
 * der bestehende /api/export/crm-Pfad ohne Umbau weiterläuft.
 */
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getIntegration } from "./providers";

export interface StoredToken {
  access_token?: string;
  refresh_token?: string;
  expires_at?: string;   // ISO
  instance_url?: string; // Salesforce
  domain?: string;       // Pipedrive (api_domain)
}
export type IntegrationTokenMap = Record<string, StoredToken>;

export interface ResolvedToken {
  accessToken: string;
  instanceUrl?: string;
  domain?: string;
}

/** Baut das StoredToken aus einer OAuth-Token-Response. */
export function buildStoredToken(tok: Record<string, unknown>): StoredToken {
  const expiresIn = Number(tok.expires_in);
  return {
    access_token: typeof tok.access_token === "string" ? tok.access_token : undefined,
    refresh_token: typeof tok.refresh_token === "string" ? tok.refresh_token : undefined,
    expires_at: Number.isFinite(expiresIn) && expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : undefined,
    instance_url: typeof tok.instance_url === "string" ? tok.instance_url : undefined,
    domain: typeof tok.api_domain === "string" ? tok.api_domain.replace(/^https?:\/\//, "") : undefined,
  };
}

/**
 * Liefert ein gültiges Access-Token für (userId, providerId) — refresht bei Bedarf
 * automatisch über den refresh_token + ENV-App-Creds. `null` wenn nichts hinterlegt.
 */
export async function getIntegrationAccessToken(userId: string, providerId: string): Promise<ResolvedToken | null> {
  const p = getIntegration(providerId);
  if (!p || p.auth !== "oauth" || !p.tokenUrl) return null;

  const admin = getSupabaseAdmin();
  const { data } = await admin.from("user_settings").select("integration_tokens").eq("user_id", userId).single();
  const map = (data?.integration_tokens ?? {}) as IntegrationTokenMap;
  const tok = map[providerId];
  if (!tok || (!tok.access_token && !tok.refresh_token)) return null;

  const stillValid = tok.access_token && tok.expires_at && new Date(tok.expires_at).getTime() > Date.now() + 60_000;
  if (stillValid && tok.access_token) {
    return { accessToken: tok.access_token, instanceUrl: tok.instance_url, domain: tok.domain };
  }

  const fallback = (): ResolvedToken | null =>
    tok.access_token ? { accessToken: tok.access_token, instanceUrl: tok.instance_url, domain: tok.domain } : null;

  if (!tok.refresh_token) return fallback();
  const clientId = p.clientIdEnv ? process.env[p.clientIdEnv] : undefined;
  const clientSecret = p.clientSecretEnv ? process.env[p.clientSecretEnv] : undefined;
  if (!clientId || !clientSecret) return fallback();

  // Salesforce refresht gegen die Instance, sonst der konfigurierte tokenUrl.
  const tokenUrl = providerId === "salesforce" && tok.instance_url
    ? `${tok.instance_url}/services/oauth2/token`
    : p.tokenUrl;

  try {
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tok.refresh_token,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || typeof j.access_token !== "string") return fallback();

    const fresh = buildStoredToken(j);
    const updated: StoredToken = {
      access_token: fresh.access_token,
      refresh_token: fresh.refresh_token ?? tok.refresh_token, // viele Provider geben keinen neuen
      expires_at: fresh.expires_at ?? tok.expires_at,
      instance_url: fresh.instance_url ?? tok.instance_url,
      domain: fresh.domain ?? tok.domain,
    };

    const nextMap: IntegrationTokenMap = { ...map, [providerId]: updated };
    const upd: Record<string, unknown> = { integration_tokens: nextMap };
    if (p.storeColumn) upd[p.storeColumn] = updated.access_token;
    await admin.from("user_settings").update(upd).eq("user_id", userId);

    return updated.access_token
      ? { accessToken: updated.access_token, instanceUrl: updated.instance_url, domain: updated.domain }
      : null;
  } catch {
    return fallback();
  }
}
