/* ── HubSpot CRM Push (Upsert) ── */

import type { Lead } from "@/types/leads";
import type { CrmExportResult } from "./types";
import { mapLeadToHubSpot } from "./field-mapping";

const BATCH_SIZE = 100;
const headers = (token: string) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${token}`,
});

export async function pushLeadsToHubSpot(
  leads: Lead[],
  apiKey: string,
): Promise<CrmExportResult> {
  const token = apiKey.trim();

  // Old hapikey format: 8-4-4-4-12 hex UUID — these don't work anymore
  const isLegacyHapikey = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
  if (isLegacyHapikey) {
    return {
      provider: "hubspot",
      total: leads.length,
      success: 0,
      failed: leads.length,
      errors: [
        "Ungültiger API Key: Alte HubSpot API-Keys (hapikey) werden seit Nov 2022 nicht mehr unterstützt. " +
        "Bitte einen Private App Token (pat-eu1-...) verwenden.",
      ],
    };
  }

  const result: CrmExportResult = {
    provider: "hubspot",
    total: leads.length,
    success: 0,
    failed: 0,
    errors: [],
  };

  // Split leads: those with valid email use batch upsert (dedup by email),
  // those without email use search-by-company to avoid duplicates
  const mapped = leads.map((lead) => ({ lead, contact: mapLeadToHubSpot(lead) }));
  const withEmail = mapped.filter((m) => m.contact.properties.email);
  const withoutEmail = mapped.filter((m) => !m.contact.properties.email);

  // ── 1. Batch upsert for contacts WITH email (dedup by email) ──
  for (let i = 0; i < withEmail.length; i += BATCH_SIZE) {
    const batch = withEmail.slice(i, i + BATCH_SIZE);

    try {
      const res = await fetch(
        "https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert",
        {
          method: "POST",
          headers: headers(token),
          body: JSON.stringify({
            inputs: batch.map(({ contact }) => ({
              idProperty: "email",
              id: contact.properties.email,
              properties: contact.properties,
            })),
          }),
        },
      );

      if (!res.ok) {
        const body = await res.text();
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        console.error(`[HubSpot] Batch ${batchNum} upsert failed: ${res.status} — ${body.slice(0, 500)}`);

        if (res.status === 401) {
          result.failed += leads.length - result.success;
          result.errors.push(
            "Authentifizierung fehlgeschlagen (401): Bitte prüfe deinen HubSpot Private App Token " +
            "und stelle sicher, dass der Scope \"crm.objects.contacts.write\" aktiviert ist.",
          );
          return result;
        }

        // Fallback: push individually with search-dedup
        for (const { lead, contact } of batch) {
          const r = await upsertSingle(lead, contact, token);
          result.success += r.success;
          result.failed += r.failed;
          if (r.error) result.errors.push(r.error);
        }
        continue;
      }

      const data = await res.json();
      const upserted = data.results?.length ?? 0;
      result.success += upserted;
      result.failed += batch.length - upserted;
    } catch (err) {
      result.failed += batch.length;
      result.errors.push(
        `Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${err instanceof Error ? err.message : "Netzwerkfehler"}`,
      );
    }
  }

  // ── 2. Contacts WITHOUT email: search by company name to avoid dupes ──
  for (const { lead, contact } of withoutEmail) {
    const r = await upsertSingle(lead, contact, token);
    result.success += r.success;
    result.failed += r.failed;
    if (r.error) result.errors.push(r.error);
  }

  return result;
}

/** Upsert a single contact: search by email OR company name, then update or create.
 *  If HubSpot rejects the email (INVALID_EMAIL), retry without the email field. */
async function upsertSingle(
  lead: Lead,
  contact: { properties: Record<string, string> },
  token: string,
): Promise<{ success: number; failed: number; error?: string }> {
  const attempt = async (props: Record<string, string>): Promise<Response> => {
    // Build search filter: prefer email, fallback to company + lastname
    const filters = props.email
      ? [{ propertyName: "email", operator: "EQ", value: props.email }]
      : buildCompanyFilters(props);

    let existingId: string | undefined;

    if (filters.length > 0) {
      const searchRes = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify({ filterGroups: [{ filters }], limit: 1 }),
      });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        existingId = searchData.results?.[0]?.id;
      }
    }

    if (existingId) {
      return fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${existingId}`, {
        method: "PATCH",
        headers: headers(token),
        body: JSON.stringify({ properties: props }),
      });
    }
    return fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({ properties: props }),
    });
  };

  try {
    let res = await attempt(contact.properties);

    // If HubSpot rejects the email, strip it and retry
    if (res.status === 400 && contact.properties.email) {
      const body = await res.json().catch(() => null);
      const isEmailError = JSON.stringify(body).includes("INVALID_EMAIL");
      if (isEmailError) {
        console.warn(`[HubSpot] Invalid email for ${lead.company} (${contact.properties.email}) — retrying without email`);
        const { email: _dropped, ...propsWithoutEmail } = contact.properties;
        res = await attempt(propsWithoutEmail);
      }
    }

    if (res.ok || res.status === 409) {
      return { success: 1, failed: 0 };
    }

    const body = await res.json().catch(() => null);
    return { success: 0, failed: 1, error: `${lead.company}: ${body?.message || `HTTP ${res.status}`}` };
  } catch {
    return { success: 0, failed: 1, error: `${lead.company}: Netzwerkfehler` };
  }
}

/** Build search filters for contacts without email — match by company + lastname */
function buildCompanyFilters(
  props: Record<string, string>,
): Array<{ propertyName: string; operator: string; value: string }> {
  const filters: Array<{ propertyName: string; operator: string; value: string }> = [];

  if (props.company) {
    filters.push({ propertyName: "company", operator: "EQ", value: props.company });
  }
  if (props.lastname) {
    filters.push({ propertyName: "lastname", operator: "EQ", value: props.lastname });
  }

  // Only use compound filter if we have at least company name
  return props.company ? filters : [];
}

/** Test HubSpot connection by fetching contacts list */
export async function testHubSpotConnection(
  apiKey: string,
): Promise<{ ok: boolean; error?: string }> {
  const token = apiKey.trim();
  const isLegacyHapikey = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
  if (isLegacyHapikey) {
    return {
      ok: false,
      error: "Alter API-Key (hapikey) wird seit Nov 2022 nicht mehr unterstützt. Bitte Private App Token verwenden.",
    };
  }
  try {
    const res = await fetch("https://api.hubapi.com/crm/v3/objects/contacts?limit=1", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) return { ok: true };
    const body = await res.json().catch(() => null);
    const msg = body?.message || "";
    if (res.status === 401) {
      return {
        ok: false,
        error: `Authentifizierung fehlgeschlagen: ${msg || "Token wird von HubSpot nicht erkannt"}. ` +
          "Verwende einen Private App Token (pat-eu1-/pat-na1-...).",
      };
    }
    if (res.status === 403) return { ok: false, error: "Fehlende Berechtigungen — Scopes crm.objects.contacts.read + .write prüfen" };
    return { ok: false, error: msg || `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Netzwerkfehler" };
  }
}
