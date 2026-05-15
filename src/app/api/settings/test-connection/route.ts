/* ── API Route: POST /api/settings/test-connection ── */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { testConnection as testMicrosoftGraph } from "@/lib/email/microsoft-graph";
import type { CrmProvider } from "@/lib/crm/types";

type TestProvider = CrmProvider | "unipile" | "microsoft-graph";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const body = await request.json();
    const { provider, credentials } = body as {
      provider: TestProvider;
      credentials: Record<string, string>;
    };

    if (!provider) {
      return NextResponse.json({ error: "Provider fehlt" }, { status: 400 });
    }

    let result: { ok: boolean; error?: string };

    switch (provider) {
      case "hubspot": {
        const apiKey = credentials.hubspot_api_key;
        if (!apiKey?.trim()) return NextResponse.json({ error: "API Key fehlt" }, { status: 400 });
        result = await testHubSpot(apiKey.trim());
        break;
      }
      case "pipedrive": {
        const apiKey = credentials.pipedrive_api_key;
        const domain = credentials.pipedrive_domain;
        if (!apiKey?.trim() || !domain?.trim()) return NextResponse.json({ error: "API Key und Domain erforderlich" }, { status: 400 });
        result = await testPipedrive(apiKey.trim(), domain.trim());
        break;
      }
      case "salesforce": {
        const url = credentials.salesforce_instance_url;
        const token = credentials.salesforce_access_token;
        if (!url?.trim() || !token?.trim()) return NextResponse.json({ error: "Instance URL und Access Token erforderlich" }, { status: 400 });
        result = await testSalesforce(url.trim(), token.trim());
        break;
      }
      case "zoho": {
        const cid = credentials.zoho_client_id;
        const cs = credentials.zoho_client_secret;
        const rt = credentials.zoho_refresh_token;
        if (!cid?.trim() || !cs?.trim() || !rt?.trim()) return NextResponse.json({ error: "Alle Zoho-Felder erforderlich" }, { status: 400 });
        result = await testZoho(cid.trim(), cs.trim(), rt.trim());
        break;
      }
      case "webhook": {
        const url = credentials.webhook_url;
        if (!url?.trim()) return NextResponse.json({ error: "Webhook URL fehlt" }, { status: 400 });
        result = await testWebhook(url.trim());
        break;
      }
      case "unipile": {
        const dsn = credentials.unipile_dsn;
        const key = credentials.unipile_api_key;
        if (!dsn?.trim() || !key?.trim()) return NextResponse.json({ error: "DSN und API Key erforderlich" }, { status: 400 });
        result = await testUnipile(dsn.trim(), key.trim());
        break;
      }
      case "microsoft-graph": {
        const tid = credentials.ms_tenant_id;
        const cid = credentials.ms_client_id;
        const cs = credentials.ms_client_secret;
        const se = credentials.sender_email;
        if (!tid?.trim() || !cid?.trim() || !cs?.trim() || !se?.trim()) {
          return NextResponse.json({ error: "Tenant ID, Client ID, Client Secret und Sender E-Mail erforderlich" }, { status: 400 });
        }
        result = await testMicrosoftGraph({
          tenantId: tid.trim(),
          clientId: cid.trim(),
          clientSecret: cs.trim(),
          senderEmail: se.trim(),
          senderName: credentials.sender_name?.trim(),
        });
        break;
      }
      default:
        return NextResponse.json({ error: `Unbekannter Provider: ${provider}` }, { status: 400 });
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("[API /api/settings/test-connection]", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

async function testHubSpot(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    console.log(`[HubSpot test] Token length=${apiKey.length}, starts="${apiKey.slice(0, 6)}…", ends="…${apiKey.slice(-4)}"`);
    const res = await fetch("https://api.hubapi.com/crm/v3/objects/contacts?limit=1", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) return { ok: true };
    const body = await res.json().catch(() => null);
    const msg = body?.message || "";
    console.error(`[HubSpot test] ${res.status}: ${msg}`);
    if (res.status === 401) {
      return {
        ok: false,
        error: `Authentifizierung fehlgeschlagen (401): ${msg || "Token wird von HubSpot nicht erkannt"}. ` +
          "Stelle sicher, dass du einen Private App Token (pat-eu1-/pat-na1-...) verwendest. " +
          "Private Apps findest du unter: HubSpot Einstellungen → Integrationen → Private Apps.",
      };
    }
    if (res.status === 403) return { ok: false, error: "Fehlende Berechtigungen — Scopes crm.objects.contacts.read + .write prüfen" };
    return { ok: false, error: body?.message || `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Netzwerkfehler" };
  }
}

async function testPipedrive(apiKey: string, domain: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`https://${domain}.pipedrive.com/api/v2/persons?limit=1`, {
      headers: { "x-api-token": apiKey },
    });
    if (res.ok) return { ok: true };
    if (res.status === 401) return { ok: false, error: "Ungültiger API Token" };
    if (res.status === 404) return { ok: false, error: "Domain nicht gefunden" };
    return { ok: false, error: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Netzwerkfehler" };
  }
}

async function testSalesforce(instanceUrl: string, accessToken: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const baseUrl = instanceUrl.replace(/\/$/, "");
    const res = await fetch(`${baseUrl}/services/data/v59.0/limits`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) return { ok: true };
    if (res.status === 401) return { ok: false, error: "Ungültiger Access Token" };
    if (res.status === 403) return { ok: false, error: "Fehlende Berechtigungen" };
    return { ok: false, error: `HTTP ${res.status}` };
  } catch (err) {
    if (err instanceof Error && err.message.includes("fetch")) {
      return { ok: false, error: "Instance URL nicht erreichbar" };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Netzwerkfehler" };
  }
}

async function testZoho(clientId: string, clientSecret: string, refreshToken: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    });
    const res = await fetch(`https://accounts.zoho.eu/oauth/v2/token?${params.toString()}`, {
      method: "POST",
    });
    const data = await res.json();
    if (data.access_token) return { ok: true };
    return { ok: false, error: data.error || "OAuth-Token konnte nicht erneuert werden" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Netzwerkfehler" };
  }
}

async function testWebhook(url: string): Promise<{ ok: boolean; error?: string }> {
  try {
    // Send a test ping with empty payload
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ test: true, timestamp: new Date().toISOString() }),
    });
    // Accept any 2xx response
    if (res.ok) return { ok: true };
    return { ok: false, error: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "URL nicht erreichbar" };
  }
}

async function testUnipile(dsn: string, apiKey: string): Promise<{ ok: boolean; error?: string; accountId?: string }> {
  try {
    let baseUrl = dsn.trim().replace(/\/$/, "");
    baseUrl = baseUrl.replace(/^(https?:\/\/)+/i, "");
    baseUrl = `https://${baseUrl}`;
    const res = await fetch(`${baseUrl}/api/v1/accounts`, {
      headers: {
        "X-API-KEY": apiKey,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      if (res.status === 401) return { ok: false, error: "Ungültiger API Key" };
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    const accounts = data.items ?? data ?? [];
    if (Array.isArray(accounts) && accounts.length > 0) {
      return { ok: true, accountId: accounts[0].id };
    }
    return { ok: false, error: "Kein LinkedIn-Konto gefunden. Bitte verbinde zuerst ein Konto in Unipile." };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "DSN nicht erreichbar" };
  }
}
