/* ──────────────────────────────────────────────────────────────
   ConnectSafely API Client
   Spec: https://api.connectsafely.ai/linkedin/openapi.json
   Auth: Bearer <api-key>
   Base: https://api.connectsafely.ai

   Methodensignatur ist absichtlich identisch zum vorherigen Unipile-
   Client, damit aufrufende Code-Stellen unverändert weiterlaufen.
   ────────────────────────────────────────────────────────────── */

import type {
  CSAccountResponse,
  CSPeopleSearchRequest,
  CSPeopleSearchResponse,
  CSProfileResponse,
  CSConnectRequest,
  CSConnectResponse,
  CSSendMessageRequest,
  CSSendMessageResponse,
  CSGeoSearchResult,
  CSRateLimitInfo,
  LegacyAccount,
  LegacyProfile,
  LegacySearchResponse,
  LegacyInviteResponse,
  LegacyMessage,
} from "./types";

const CS_BASE_URL = "https://api.connectsafely.ai";

/* ── Helpers: extract profileId from URL/identifier ───────────── */

export function profileIdFromIdentifier(idOrUrl: string): string {
  const trimmed = (idOrUrl || "").trim();
  // Direct slug
  const slugMatch = trimmed.match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (slugMatch) return decodeURIComponent(slugMatch[1]);
  // Sales Nav URL
  const snMatch = trimmed.match(/linkedin\.com\/sales\/lead\/([^,/?#]+)/i);
  if (snMatch) return decodeURIComponent(snMatch[1]);
  // Already a slug
  return trimmed.replace(/^urn:li:.*?:/, "");
}

function isUrn(s?: string): boolean {
  return !!s && s.startsWith("urn:li:");
}

/* ── Error class with rate-limit context ──────────────────────── */

export class ConnectSafelyError extends Error {
  status: number;
  code?: string;
  rateLimitReset?: string;
  rateLimitAction?: string;
  constructor(message: string, status: number, extras?: { code?: string; rateLimitReset?: string; rateLimitAction?: string }) {
    super(message);
    this.name = "ConnectSafelyError";
    this.status = status;
    this.code = extras?.code;
    this.rateLimitReset = extras?.rateLimitReset;
    this.rateLimitAction = extras?.rateLimitAction;
  }
}

/* ── Client ────────────────────────────────────────────────────── */

export interface ConnectSafelyClientOptions {
  apiKey: string;
  /** Optional fixed account ID, used as fallback when caller passes nothing. */
  defaultAccountId?: string;
}

export class ConnectSafelyClient {
  private apiKey: string;
  private defaultAccountId?: string;
  private lastRequestAt = 0;
  /** Pause for ~600ms between requests (gentle pacing). */
  private minInterval = 600;
  /** Last seen rate-limit info, exposed for callers. */
  public lastRateLimit: CSRateLimitInfo | null = null;

  constructor(opts: ConnectSafelyClientOptions) {
    this.apiKey = opts.apiKey;
    this.defaultAccountId = opts.defaultAccountId;
  }

  /* ── Rate-pacing throttle ────────────────────────────────────── */
  private async throttle() {
    const now = Date.now();
    const elapsed = now - this.lastRequestAt;
    if (elapsed < this.minInterval) {
      await new Promise((r) => setTimeout(r, this.minInterval - elapsed));
    }
    this.lastRequestAt = Date.now();
  }

  /* ── Core request ────────────────────────────────────────────── */
  private async request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    await this.throttle();
    const url = `${CS_BASE_URL}${path}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init.headers || {}),
      },
    });

    // Capture rate-limit headers
    this.lastRateLimit = {
      action:    res.headers.get("X-RateLimit-Action") ?? undefined,
      limit:     numOrUndef(res.headers.get("X-RateLimit-Limit")),
      used:      numOrUndef(res.headers.get("X-RateLimit-Used")),
      remaining: numOrUndef(res.headers.get("X-RateLimit-Remaining")),
      reset:     res.headers.get("X-RateLimit-Reset") ?? undefined,
    };

    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      let message = `LinkedIn API ${res.status}`;
      let code: string | undefined;
      try {
        const parsed = JSON.parse(bodyText) as { message?: string; error?: string; code?: string };
        message = parsed.message || parsed.error || message;
        code = parsed.code;
      } catch {
        if (bodyText) message = `${message}: ${bodyText.slice(0, 200)}`;
      }
      if (res.status === 401) message = "LinkedIn-Verbindung ungültig — bitte API-Key in den Einstellungen prüfen";
      else if (res.status === 403) message = "LinkedIn-Zugriff verweigert (Limit oder Konto-Status)";
      else if (res.status === 429) {
        message = `Rate-Limit erreicht${this.lastRateLimit?.action ? ` (${this.lastRateLimit.action})` : ""} — Reset: ${this.lastRateLimit?.reset ?? "unbekannt"}`;
      }
      throw new ConnectSafelyError(message, res.status, {
        code,
        rateLimitReset: this.lastRateLimit?.reset,
        rateLimitAction: this.lastRateLimit?.action,
      });
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  /* ── Accounts ────────────────────────────────────────────────── */

  /** Returns the current authenticated account (ConnectSafely API does
   *  not have a list-all endpoint — one API key = one default account). */
  async getAccount(accountId?: string): Promise<CSAccountResponse> {
    const id = accountId ?? this.defaultAccountId;
    if (id) return this.request<CSAccountResponse>(`/account/${id}/status`);
    return this.request<CSAccountResponse>("/account/status");
  }

  /** Legacy wrapper: returns a single-item array shaped like the old
   *  Unipile /accounts response, so callers don't need to change. */
  async getAccounts(): Promise<LegacyAccount[]> {
    try {
      const a = await this.getAccount();
      const premiumType = a.linkedinPlan?.premiumType;
      const type: LegacyAccount["type"] =
        premiumType === "SALES_NAVIGATOR" ? "sales_navigator"
        : premiumType === "BUSINESS_PREMIUM" || premiumType === "RECRUITER" ? "premium"
        : "classic";
      const premiumFeatures: string[] = [];
      if (premiumType === "SALES_NAVIGATOR") premiumFeatures.push("sales_navigator");
      if (premiumType === "RECRUITER")        premiumFeatures.push("recruiter");
      if (premiumType === "BUSINESS_PREMIUM") premiumFeatures.push("business_premium");
      return [{
        id: a.id,
        provider: "LINKEDIN",
        type,
        name: [a.firstName, a.lastName].filter(Boolean).join(" ") || a.publicId || a.id,
        status: a.status,
        connection_params: {
          im: {
            id: a.id,
            publicIdentifier: a.publicId,
            username: [a.firstName, a.lastName].filter(Boolean).join(" "),
            premiumFeatures,
          },
        },
      }];
    } catch {
      return [];
    }
  }

  /* ── Geo search (resolve location string → ID) ───────────────── */

  async searchGeo(keywords: string, count = 5): Promise<CSGeoSearchResult[]> {
    try {
      const body = JSON.stringify({ keywords, count });
      const res = await this.request<{ results?: CSGeoSearchResult[]; geo?: CSGeoSearchResult[] }>(
        "/search/geo",
        { method: "POST", body },
      );
      return res.results ?? res.geo ?? [];
    } catch {
      return [];
    }
  }

  /** Legacy wrapper for Unipile-style searchParameters(). */
  async searchParameters(
    _accountId: string,
    type: "LOCATION" | "INDUSTRY" | "COMPANY" | "SCHOOL",
    keywords: string,
    limit = 5,
  ): Promise<{ id: string; title: string }[]> {
    if (type !== "LOCATION") return []; // CS only exposes geo search
    const geos = await this.searchGeo(keywords, limit);
    return geos.map((g) => ({ id: g.geoId || g.geoUrn, title: g.name }));
  }

  /* ── People Search ───────────────────────────────────────────── */

  async searchPeople(req: CSPeopleSearchRequest): Promise<CSPeopleSearchResponse> {
    const body: CSPeopleSearchRequest = {
      accountId: req.accountId ?? this.defaultAccountId,
      ...req,
    };
    return this.request<CSPeopleSearchResponse>("/search/people", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /** Legacy wrapper matching the old Unipile signature so the existing
   *  LinkedInSearchForm keeps working without changes. */
  async searchLinkedIn(
    accountId: string,
    query: string,
    options?: {
      category?: string;
      locationIds?: string[];
      cursor?: string;
      limit?: number;
      api?: string;
      url?: string;
    },
  ): Promise<LegacySearchResponse> {
    const start = options?.cursor ? Number(options.cursor) || 0 : 0;
    const count = Math.min(50, options?.limit ?? 50);

    const filters: CSPeopleSearchRequest["filters"] = {};
    if (options?.locationIds?.length) {
      // CS accepts a single locationId; take the first one
      filters.locationId = options.locationIds[0];
    }

    const res = await this.searchPeople({
      accountId,
      keywords: query,
      count,
      start,
      url: options?.url,
      filters: Object.keys(filters).length ? filters : undefined,
    });

    const items = (res.people ?? []).map((p) => {
      const fullName = [p.firstName, p.lastName].filter(Boolean).join(" ");
      return {
        id: p.profileId ?? p.profileUrn ?? "",
        type: "person",
        name: fullName || (p.profileId ?? ""),
        provider_id: p.profileUrn ?? p.profileId,
        public_identifier: p.profileId,
        first_name: p.firstName,
        last_name: p.lastName,
        headline: p.headline,
        location: p.location,
        profile_picture_url: p.profilePicture,
        profile_picture_url_large: p.profilePicture,
        profile_url: p.profileUrl,
        public_profile_url: p.profileUrl,
        network_distance: p.connectionDegree,
        verified: p.isPremium,
      };
    });

    // CS pagination shape → legacy cursor (next offset)
    const total = res.pagination?.total;
    const nextStart = start + items.length;
    const hasMore = res.hasMore ?? (total ? nextStart < total : items.length === count);
    const cursor = hasMore && items.length > 0 ? String(nextStart) : null;

    return {
      object: "search.response",
      items,
      cursor,
      paging: {
        start,
        page_count: items.length,
        total_count: total ?? 0,
      },
    };
  }

  /* ── Profile ─────────────────────────────────────────────────── */

  async getProfileRaw(profileId: string, accountId?: string): Promise<CSProfileResponse> {
    return this.request<CSProfileResponse>("/profile", {
      method: "POST",
      body: JSON.stringify({
        accountId: accountId ?? this.defaultAccountId,
        profileId,
        includeGeoLocation: true,
        includeContact: false,
        includeExperience: true,
        includeEducation: true,
        includeSkills: true,
      }),
    });
  }

  /** Legacy wrapper — same signature as old Unipile getProfile. */
  async getProfile(accountId: string, identifier: string): Promise<LegacyProfile> {
    const profileId = profileIdFromIdentifier(identifier);
    const raw = await this.getProfileRaw(profileId, accountId);
    const p = raw.profile ?? {};
    return {
      provider_id: p.profileUrn ?? raw.profileId ?? profileId,
      public_identifier: p.profileId ?? raw.profileId ?? profileId,
      first_name: p.firstName,
      last_name: p.lastName,
      headline: p.headline,
      summary: p.summary,
      location: p.location,
      industry: p.industry,
      profile_picture_url: p.profilePicture,
      profile_picture_url_large: p.profilePicture,
      background_picture_url: p.backgroundPicture,
      profile_url: p.publicProfileUrl,
      is_premium: p.isPremium,
      is_influencer: p.isInfluencer,
      is_creator: p.isCreator,
      follower_count: p.followerCount,
      connections_count: p.connectionsCount,
      work_experience: (raw.experience ?? []).map((e) => ({
        title: e.title,
        company: e.company ?? e.companyName,
        company_name: e.companyName ?? e.company,
        company_picture_url: e.companyLogo,
        location: e.location,
        description: e.description,
        start_date: e.startDate,
        end_date: e.endDate,
        is_current: e.current,
      })),
      education: (raw.education ?? []).map((e) => ({
        school: e.schoolName,
        school_name: e.schoolName,
        degree: e.degree,
        field_of_study: e.fieldOfStudy,
        start_date: e.startDate,
        end_date: e.endDate,
      })),
      skills: (raw.skills ?? []).map((s) => s.name).filter(Boolean) as string[],
    };
  }

  /* ── Invitations / Connection requests ───────────────────────── */

  async connect(req: CSConnectRequest): Promise<CSConnectResponse> {
    return this.request<CSConnectResponse>("/connect", {
      method: "POST",
      body: JSON.stringify({
        accountId: req.accountId ?? this.defaultAccountId,
        ...req,
      }),
    });
  }

  /** Legacy wrapper — same signature as old Unipile sendInvitation(). */
  async sendInvitation(
    accountId: string,
    identifier: string,
    message?: string,
  ): Promise<LegacyInviteResponse> {
    const req: CSConnectRequest = {
      accountId,
      customMessage: message,
    };
    if (isUrn(identifier)) req.profileUrn = identifier;
    else req.profileId = profileIdFromIdentifier(identifier);
    const res = await this.connect(req);
    return { object: "invitation.sent", provider_id: res.profileUrn };
  }

  async withdrawInvitation(profileId: string, accountId?: string): Promise<void> {
    await this.request("/invitations/withdraw", {
      method: "POST",
      body: JSON.stringify({
        accountId: accountId ?? this.defaultAccountId,
        profileId: profileIdFromIdentifier(profileId),
      }),
    });
  }

  /* ── Messaging ───────────────────────────────────────────────── */

  async sendMessage(req: CSSendMessageRequest): Promise<CSSendMessageResponse> {
    return this.request<CSSendMessageResponse>("/conversations/send", {
      method: "POST",
      body: JSON.stringify({
        accountId: req.accountId ?? this.defaultAccountId,
        ...req,
      }),
    });
  }

  /** Legacy wrapper — same signature as Unipile sendNewMessage(). */
  async sendNewMessage(
    accountId: string,
    recipientIdentifier: string,
    text: string,
  ): Promise<LegacyMessage> {
    const req: CSSendMessageRequest = {
      accountId,
      message: text,
    };
    if (isUrn(recipientIdentifier)) req.recipientProfileUrn = recipientIdentifier;
    else req.recipientProfileId = profileIdFromIdentifier(recipientIdentifier);

    const res = await this.sendMessage(req);
    return {
      id: res.messageId ?? res.threadId ?? "",
      text,
      sender_provider_id: accountId,
      created_at: new Date().toISOString(),
    };
  }

  /** Legacy wrapper — old Unipile sendMessage with chatId. ConnectSafely
   *  doesn't expose chatId-based sending; we treat the chatId as
   *  conversationUrn. */
  async sendMessageToChat(chatId: string, text: string, accountId?: string): Promise<LegacyMessage> {
    const res = await this.sendMessage({
      accountId,
      conversationUrn: chatId,
      message: text,
    });
    return {
      id: res.messageId ?? res.threadId ?? "",
      text,
      created_at: new Date().toISOString(),
    };
  }

  /* ── Relationship status check ───────────────────────────────── */
  async getRelationship(profileId: string): Promise<{
    connected: boolean; invitationSent: boolean; invitationReceived: boolean;
  }> {
    return this.request(`/relationship/${encodeURIComponent(profileIdFromIdentifier(profileId))}`);
  }
}

/* ── Helpers ─────────────────────────────────────────────────── */

function numOrUndef(v: string | null): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/* ── Factory ─────────────────────────────────────────────────── */

export function createConnectSafelyClient(
  apiKey: string,
  defaultAccountId?: string,
): ConnectSafelyClient {
  return new ConnectSafelyClient({ apiKey, defaultAccountId });
}
