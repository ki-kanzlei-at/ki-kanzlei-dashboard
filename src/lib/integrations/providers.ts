/* ── Integrations-Katalog: CRMs (OAuth) + Automatisierung (Link) ──
 * Wird vom Settings-UI (Karten/Logos) UND den OAuth-Routen genutzt.
 * Enthält nur Konfiguration/Strings — keine Secrets (nur ENV-Namen).
 */
export type IntegrationKind = "crm" | "automation";

export interface IntegrationProvider {
  id: string;
  name: string;
  kind: IntegrationKind;
  slug: string;   // simpleicons-Slug (cdn.simpleicons.org)
  color: string;  // Brand-Hex ohne #
  desc: string;
  auth: "oauth" | "link";
  /* OAuth */
  authorizeUrl?: string;
  tokenUrl?: string;
  scope?: string;
  clientIdEnv?: string;
  clientSecretEnv?: string;
  storeColumn?: string;   // user_settings-Spalte für den Token
  connectedKey?: string;  // user_settings-Spalte zur Verbunden-Prüfung
  /* Link (Automatisierung) */
  externalUrl?: string;
}

export const INTEGRATIONS: IntegrationProvider[] = [
  {
    id: "hubspot", name: "HubSpot", kind: "crm", slug: "hubspot", color: "FF7A59",
    desc: "Leads, Kontakte & Deals beidseitig synchronisieren.",
    auth: "oauth",
    authorizeUrl: "https://app.hubspot.com/oauth/authorize",
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    scope: "oauth crm.objects.contacts.read crm.objects.contacts.write",
    clientIdEnv: "HUBSPOT_OAUTH_CLIENT_ID",
    clientSecretEnv: "HUBSPOT_OAUTH_CLIENT_SECRET",
    storeColumn: "hubspot_api_key",
    connectedKey: "hubspot_api_key",
  },
  {
    id: "pipedrive", name: "Pipedrive", kind: "crm", slug: "pipedrive", color: "172733",
    desc: "Leads pushen und Pipeline-Aktivitäten tracken.",
    auth: "oauth",
    authorizeUrl: "https://oauth.pipedrive.com/oauth/authorize",
    tokenUrl: "https://oauth.pipedrive.com/oauth/token",
    clientIdEnv: "PIPEDRIVE_OAUTH_CLIENT_ID",
    clientSecretEnv: "PIPEDRIVE_OAUTH_CLIENT_SECRET",
    storeColumn: "pipedrive_api_key",
    connectedKey: "pipedrive_api_key",
  },
  {
    id: "salesforce", name: "Salesforce", kind: "crm", slug: "salesforce", color: "00A1E0",
    desc: "Leads & Opportunities mit der Sales Cloud syncen.",
    auth: "oauth",
    authorizeUrl: "https://login.salesforce.com/services/oauth2/authorize",
    tokenUrl: "https://login.salesforce.com/services/oauth2/token",
    scope: "api refresh_token",
    clientIdEnv: "SALESFORCE_OAUTH_CLIENT_ID",
    clientSecretEnv: "SALESFORCE_OAUTH_CLIENT_SECRET",
    storeColumn: "salesforce_access_token",
    connectedKey: "salesforce_access_token",
  },
  {
    id: "zoho", name: "Zoho CRM", kind: "crm", slug: "zoho", color: "E42527",
    desc: "Leads & Kontakte bidirektional synchronisieren.",
    auth: "oauth",
    authorizeUrl: "https://accounts.zoho.eu/oauth/v2/auth",
    tokenUrl: "https://accounts.zoho.eu/oauth/v2/token",
    scope: "ZohoCRM.modules.ALL",
    clientIdEnv: "ZOHO_OAUTH_CLIENT_ID",
    clientSecretEnv: "ZOHO_OAUTH_CLIENT_SECRET",
    storeColumn: "zoho_refresh_token",
    connectedKey: "zoho_refresh_token",
  },
  {
    id: "zapier", name: "Zapier", kind: "automation", slug: "zapier", color: "FF4F00",
    desc: "Mit 7000+ Apps automatisieren — ohne Code.",
    auth: "link",
    externalUrl: "https://zapier.com/apps",
  },
  {
    id: "make", name: "Make", kind: "automation", slug: "make", color: "6D00CC",
    desc: "Visuelle Szenarien & Workflows bauen.",
    auth: "link",
    externalUrl: "https://www.make.com/en/integrations",
  },
  {
    id: "n8n", name: "n8n", kind: "automation", slug: "n8n", color: "EA4B71",
    desc: "Self-hosted Workflows per Webhook anbinden.",
    auth: "link",
    externalUrl: "https://n8n.io/integrations/",
  },
];

export function getIntegration(id: string): IntegrationProvider | null {
  return INTEGRATIONS.find((p) => p.id === id) ?? null;
}
