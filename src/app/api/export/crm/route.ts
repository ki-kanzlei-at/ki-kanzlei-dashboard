/* ── API Route: POST /api/export/crm ── */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserSettings } from "@/lib/supabase/settings";
import { getLeads } from "@/lib/supabase/leads";
import type { Lead, LeadFilters } from "@/types/leads";
import type { CrmProvider, CrmExportResult } from "@/lib/crm/types";
import { pushLeadsToHubSpot } from "@/lib/crm/hubspot";
import { pushLeadsToPipedrive } from "@/lib/crm/pipedrive";
import { pushLeadsToSalesforce } from "@/lib/crm/salesforce";
import { pushLeadsToZoho } from "@/lib/crm/zoho";
import { pushLeadsToWebhook } from "@/lib/crm/webhook";
import { getIntegrationAccessToken } from "@/lib/integrations/tokens";

export async function POST(request: NextRequest) {
  try {
    /* Auth */
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const body = await request.json();
    const { provider, selectionMode, ids, filters, webhook_url } = body as {
      provider: CrmProvider;
      selectionMode: "ids" | "all";
      ids?: string[];
      filters?: LeadFilters;
      webhook_url?: string;
    };

    if (!provider) {
      return NextResponse.json({ error: "Provider fehlt" }, { status: 400 });
    }

    /* Settings laden */
    const settings = await getUserSettings(user.id);

    /* Leads laden */
    const allLeads: Lead[] = [];

    if (selectionMode === "ids" && ids?.length) {
      // Fetch by IDs in batches
      const batchSize = 100;
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        const result = await getLeads({ ids: batch }, { pageSize: batchSize });
        allLeads.push(...result.data);
      }
    } else if (selectionMode === "all") {
      // Fetch all filtered leads
      let page = 1;
      const pageSize = 100;
      while (true) {
        const result = await getLeads(filters ?? {}, { page, pageSize });
        allLeads.push(...result.data);
        if (allLeads.length >= result.count || result.data.length < pageSize) break;
        page++;
      }
    } else {
      return NextResponse.json({ error: "Keine Leads ausgewählt" }, { status: 400 });
    }

    if (allLeads.length === 0) {
      return NextResponse.json({ error: "Keine Leads gefunden" }, { status: 404 });
    }

    /* Provider-Switch */
    let result: CrmExportResult;

    switch (provider) {
      case "hubspot": {
        // OAuth-Token (auto-refresh) bevorzugen, sonst manueller Token.
        const oauth = await getIntegrationAccessToken(user.id, "hubspot");
        const key = oauth?.accessToken ?? settings?.hubspot_api_key;
        if (!key) return NextResponse.json({ error: "HubSpot nicht verbunden" }, { status: 400 });
        result = await pushLeadsToHubSpot(allLeads, key);
        break;
      }
      case "pipedrive": {
        const oauth = await getIntegrationAccessToken(user.id, "pipedrive");
        const key = oauth?.accessToken ?? settings?.pipedrive_api_key;
        const domain = oauth?.domain ?? settings?.pipedrive_domain;
        if (!key || !domain) return NextResponse.json({ error: "Pipedrive nicht verbunden" }, { status: 400 });
        result = await pushLeadsToPipedrive(allLeads, key, domain);
        break;
      }
      case "salesforce": {
        const oauth = await getIntegrationAccessToken(user.id, "salesforce");
        const url = oauth?.instanceUrl ?? settings?.salesforce_instance_url;
        const token = oauth?.accessToken ?? settings?.salesforce_access_token;
        if (!url || !token) return NextResponse.json({ error: "Salesforce nicht verbunden" }, { status: 400 });
        result = await pushLeadsToSalesforce(allLeads, url, token);
        break;
      }
      case "zoho": {
        const cid = settings?.zoho_client_id;
        const cs = settings?.zoho_client_secret;
        const rt = settings?.zoho_refresh_token;
        if (!cid || !cs || !rt) return NextResponse.json({ error: "Zoho Credentials nicht konfiguriert" }, { status: 400 });
        result = await pushLeadsToZoho(allLeads, cid, cs, rt);
        break;
      }
      case "webhook": {
        const url = webhook_url || settings?.webhook_url;
        if (!url) return NextResponse.json({ error: "Webhook URL nicht konfiguriert" }, { status: 400 });
        result = await pushLeadsToWebhook(allLeads, url);
        break;
      }
      default:
        return NextResponse.json({ error: `Unbekannter Provider: ${provider}` }, { status: 400 });
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("[API /api/export/crm]", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
