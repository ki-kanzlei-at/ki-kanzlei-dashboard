/* ── Lead → CRM Field Mapping ── */

import type { Lead } from "@/types/leads";
import type {
  HubSpotContact,
  PipedriveContact,
  SalesforceContact,
  ZohoContact,
} from "./types";

/** Felder für die Mapping-Vorschau im Dialog */
export const FIELD_MAPPINGS = {
  hubspot: [
    { from: "Firma", to: "company" },
    { from: "E-Mail", to: "email" },
    { from: "GF Vorname", to: "firstname" },
    { from: "GF Nachname", to: "lastname" },
    { from: "Telefon", to: "phone" },
    { from: "Website", to: "website" },
    { from: "Stadt", to: "city" },
    { from: "PLZ", to: "zip" },
    { from: "Straße", to: "address" },
    { from: "Land", to: "country" },
    { from: "GF Titel", to: "jobtitle" },
  ],
  pipedrive: [
    { from: "GF Name", to: "name" },
    { from: "E-Mail", to: "email[0].value" },
    { from: "Telefon", to: "phone[0].value" },
  ],
  salesforce: [
    { from: "GF Vorname", to: "FirstName" },
    { from: "GF Nachname", to: "LastName" },
    { from: "E-Mail", to: "Email" },
    { from: "Telefon", to: "Phone" },
    { from: "GF Titel", to: "Title" },
    { from: "Firma", to: "Company" },
    { from: "Straße", to: "MailingStreet" },
    { from: "Stadt", to: "MailingCity" },
    { from: "PLZ", to: "MailingPostalCode" },
    { from: "Land", to: "MailingCountry" },
    { from: "Website", to: "Website" },
    { from: "Branche", to: "Industry" },
  ],
  zoho: [
    { from: "GF Vorname", to: "First_Name" },
    { from: "GF Nachname", to: "Last_Name" },
    { from: "E-Mail", to: "Email" },
    { from: "Telefon", to: "Phone" },
    { from: "Firma", to: "Company" },
    { from: "GF Titel", to: "Title" },
    { from: "Straße", to: "Mailing_Street" },
    { from: "Stadt", to: "Mailing_City" },
    { from: "PLZ", to: "Mailing_Zip" },
    { from: "Land", to: "Mailing_Country" },
    { from: "Website", to: "Website" },
    { from: "Branche", to: "Industry" },
  ],
  webhook: [
    { from: "Alle Felder", to: "JSON-Payload" },
  ],
} as const;

/** Strict email validation — must end with a known-length TLD (2-6 chars), no junk */
function isValidEmail(email: string): boolean {
  // Standard format: local@domain.tld — TLD 2-6 chars, no URL fragments or concatenated junk
  if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/.test(email)) return false;
  // Reject if domain part contains "www" or looks like a URL got concatenated
  const domain = email.split("@")[1];
  if (/www\.|http/i.test(domain)) return false;
  // Reject double-dots
  if (email.includes("..")) return false;
  return true;
}

export function mapLeadToHubSpot(lead: Lead): HubSpotContact {
  // Build properties and strip empty/null/undefined values —
  // HubSpot rejects batch requests when properties contain empty strings or invalid values
  const emailClean = lead.email?.trim();
  const raw: Record<string, string | undefined> = {
    email: emailClean && isValidEmail(emailClean) ? emailClean : undefined,
    firstname: lead.ceo_first_name ?? undefined,
    lastname: lead.ceo_last_name ?? lead.ceo_name ?? lead.company,
    company: lead.company,
    phone: lead.phone ?? undefined,
    website: lead.website ?? undefined,
    city: lead.city ?? undefined,
    zip: lead.postal_code ?? undefined,
    address: lead.street ?? undefined,
    country: lead.country ?? undefined,
    jobtitle: lead.ceo_title ?? undefined,
    // Note: industry is intentionally excluded — HubSpot requires predefined enum values
  };

  const properties: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v && v.trim()) properties[k] = v.trim();
  }

  return { properties };
}

export function mapLeadToPipedrive(lead: Lead): PipedriveContact {
  const contact: PipedriveContact = {
    name: lead.ceo_name ?? lead.company,
    visible_to: 3,
  };
  if (lead.email) {
    contact.email = [{ value: lead.email, primary: true }];
  }
  if (lead.phone) {
    contact.phone = [{ value: lead.phone, primary: true }];
  }
  return contact;
}

export function mapLeadToSalesforce(lead: Lead): SalesforceContact {
  return {
    FirstName: lead.ceo_first_name ?? undefined,
    LastName: lead.ceo_last_name ?? lead.ceo_name ?? lead.company,
    Email: lead.email ?? undefined,
    Phone: lead.phone ?? undefined,
    Title: lead.ceo_title ?? undefined,
    Company: lead.company,
    MailingStreet: lead.street ?? undefined,
    MailingCity: lead.city ?? undefined,
    MailingPostalCode: lead.postal_code ?? undefined,
    MailingCountry: lead.country ?? undefined,
    Website: lead.website ?? undefined,
    Industry: lead.industry ?? undefined,
  };
}

export function mapLeadToZoho(lead: Lead): ZohoContact {
  return {
    First_Name: lead.ceo_first_name ?? undefined,
    Last_Name: lead.ceo_last_name ?? lead.ceo_name ?? lead.company,
    Email: lead.email ?? undefined,
    Phone: lead.phone ?? undefined,
    Company: lead.company,
    Title: lead.ceo_title ?? undefined,
    Mailing_Street: lead.street ?? undefined,
    Mailing_City: lead.city ?? undefined,
    Mailing_Zip: lead.postal_code ?? undefined,
    Mailing_Country: lead.country ?? undefined,
    Website: lead.website ?? undefined,
    Industry: lead.industry ?? undefined,
  };
}

export function mapLeadToWebhook(lead: Lead): Record<string, unknown> {
  return {
    id: lead.id,
    company: lead.company,
    email: lead.email,
    phone: lead.phone,
    website: lead.website,
    street: lead.street,
    city: lead.city,
    postal_code: lead.postal_code,
    country: lead.country,
    industry: lead.industry,
    legal_form: lead.legal_form,
    ceo_name: lead.ceo_name,
    ceo_first_name: lead.ceo_first_name,
    ceo_last_name: lead.ceo_last_name,
    ceo_title: lead.ceo_title,
    ceo_gender: lead.ceo_gender,
    status: lead.status,
    google_rating: lead.google_rating,
    google_reviews_count: lead.google_reviews_count,
    social_linkedin: lead.social_linkedin,
    social_facebook: lead.social_facebook,
    social_instagram: lead.social_instagram,
    social_xing: lead.social_xing,
    notes: lead.notes,
    created_at: lead.created_at,
  };
}
