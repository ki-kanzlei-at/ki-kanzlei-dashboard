/* ──────────────────────────────────────────────────────────────
   ConnectSafely API Types
   Spec: https://api.connectsafely.ai/linkedin/openapi.json
   ────────────────────────────────────────────────────────────── */

export type CSPremiumType =
  | "SALES_NAVIGATOR"
  | "RECRUITER"
  | "BUSINESS_PREMIUM"
  | "NON_PREMIUM";

export type CSAccountStatus =
  | "AVAILABLE"
  | "IN_USE"
  | "ERROR"
  | "WARMUP"
  | "UNKNOWN";

export interface CSAccountResponse {
  id: string;
  firstName?: string;
  lastName?: string;
  publicId?: string;
  platform?: string;
  status: CSAccountStatus;
  enabled: boolean;
  lastUsed?: string;
  hasTokens?: boolean;
  linkedinPlan?: {
    premiumType: CSPremiumType;
    isPremium: boolean;
  };
}

/* ── Search ── */

export interface CSPeopleSearchFilters {
  firstName?: string;
  lastName?: string;
  title?: string;
  company?: string;
  school?: string;
  locationId?: string;
  geoUrn?: string;
  industry?: string[];
  /** F = 1st, S = 2nd, O = 3rd+ */
  connectionDegree?: ("F" | "S" | "O")[];
  currentCompanyIds?: string[];
  pastCompanyIds?: string[];
  profileLanguage?: string[];
  serviceCategories?: string[];
  openToWork?: boolean;
}

export interface CSPeopleSearchRequest {
  accountId?: string;
  keywords?: string;
  count?: number;
  start?: number;
  /** Sales Navigator search URL — when provided routes through SN */
  url?: string;
  filters?: CSPeopleSearchFilters;
}

export interface CSPeopleSearchResult {
  profileId?: string;
  profileUrn?: string;
  firstName?: string;
  lastName?: string;
  headline?: string;
  profilePicture?: string;
  location?: string;
  /** "1st" | "2nd" | "3rd+" */
  connectionDegree?: string;
  currentPosition?: string;
  profileUrl?: string;
  isPremium?: boolean;
  isOpenToWork?: boolean;
}

export interface CSSearchPagination {
  start: number;
  count: number;
  total?: number;
  hasMore?: boolean;
}

export interface CSPeopleSearchResponse {
  success: boolean;
  people: CSPeopleSearchResult[];
  pagination?: CSSearchPagination;
  hasMore?: boolean;
}

/* ── Geo Search (resolve location text → ID) ── */

export interface CSGeoSearchResult {
  geoUrn: string;
  geoId: string;
  name: string;
  type?: string;
}

/* ── Profile ── */

export interface CSProfileExperience {
  title?: string;
  company?: string;
  companyName?: string;
  companyId?: string;
  companyLogo?: string;
  startDate?: string;
  endDate?: string;
  current?: boolean;
  location?: string;
  description?: string;
}

export interface CSProfileEducation {
  schoolName?: string;
  degree?: string;
  fieldOfStudy?: string;
  startDate?: string;
  endDate?: string;
}

export interface CSProfileSkill {
  name?: string;
  endorsementCount?: number;
}

export interface CSProfileObject {
  profileId?: string;
  profileUrn?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  headline?: string;
  summary?: string;
  location?: string;
  industry?: string;
  profilePicture?: string;
  backgroundPicture?: string;
  connectionsCount?: number;
  followerCount?: number;
  isPremium?: boolean;
  isInfluencer?: boolean;
  isCreator?: boolean;
  openToWork?: boolean;
  publicProfileUrl?: string;
}

export interface CSProfileResponse {
  success: boolean;
  profileId?: string;
  accountId?: string;
  profile?: CSProfileObject;
  experience?: CSProfileExperience[];
  skills?: CSProfileSkill[];
  education?: CSProfileEducation[];
  cached?: boolean;
  cachedAt?: string;
  expiresAt?: string;
  message?: string;
}

/* ── Actions ── */

export interface CSConnectRequest {
  accountId?: string;
  profileId?: string;
  profileUrn?: string;
  /** Max 300 chars */
  customMessage?: string;
}

export interface CSConnectResponse {
  success: boolean;
  message?: string;
  profileUrn?: string;
}

export interface CSSendMessageRequest {
  accountId?: string;
  recipientProfileId?: string;
  recipientProfileUrn?: string;
  conversationUrn?: string;
  message: string;
  subject?: string;
  attachments?: unknown[];
}

export interface CSSendMessageResponse {
  success: boolean;
  message?: string;
  recipientProfileUrn?: string;
  conversationId?: string;
  messageId?: string;
  sentMessage?: unknown;
  threadId?: string;
}

export interface CSWithdrawInvitationRequest {
  accountId?: string;
  profileId: string;
  memberId?: string;
  profileUrn?: string;
  invitationId?: string;
}

/* ── Relationship ── */

export interface CSRelationship {
  connected: boolean;
  invitationSent: boolean;
  invitationReceived: boolean;
  status?: string;
  profileUrn?: string;
  accountId?: string;
}

/* ── Errors + Rate Limits ── */

export interface CSError {
  status: number;
  message: string;
  code?: string;
  rateLimitReset?: string;
  rateLimitAction?: string;
}

export interface CSRateLimitInfo {
  action?: string;
  limit?: number;
  used?: number;
  remaining?: number;
  /** ISO 8601 timestamp */
  reset?: string;
}

/* ──────────────────────────────────────────────────────────────
   Documented LinkedIn safety limits per account
   Sources:
   - /connect:           90 / week  (resets Mondays 00:00 UTC, exceed → 24h hold)
   - /conversations/send  100 / day  (LinkedIn-side)
   - /profile             120 unique / day (cached 6h, cached calls free)
   - /follow              100 / day
   - /search/people       300 / month (resets 1st of month)
   - /posts/comment       100 / day
   - /groups/members      1000 / day

   We keep safety buffers below the hard limits so we never trigger holds.
   ────────────────────────────────────────────────────────────── */
export const CS_LIMITS = {
  /** weekly connect requests — hard cap 90, our soft cap 80 */
  connectPerWeek:     { hard: 90,   soft: 80,  window: "week"  as const },
  /** daily messages — hard cap 100, our soft cap 60 */
  messagePerDay:      { hard: 100,  soft: 60,  window: "day"   as const },
  /** unique profile lookups per day — hard 120, soft 100 (cached do not count) */
  profilePerDay:      { hard: 120,  soft: 100, window: "day"   as const },
  /** searches per month — hard 300, soft 250 */
  searchPerMonth:     { hard: 300,  soft: 250, window: "month" as const },
  /** follow/unfollow — hard 100/day, soft 60 */
  followPerDay:       { hard: 100,  soft: 60,  window: "day"   as const },
  /** comments — hard 100/day, soft 40 */
  commentPerDay:      { hard: 100,  soft: 40,  window: "day"   as const },
} as const;

export type CSActionKind = keyof typeof CS_LIMITS;

/* ──────────────────────────────────────────────────────────────
   Backwards-compatible shapes (mirror old Unipile types so call-sites
   that still consume the old fields keep working).
   ────────────────────────────────────────────────────────────── */

export interface LegacySearchResult {
  id: string;
  type?: string;
  name?: string;
  provider_id?: string;
  public_identifier?: string;
  first_name?: string;
  last_name?: string;
  headline?: string;
  location?: string;
  industry?: string;
  profile_picture_url?: string;
  profile_picture_url_large?: string;
  profile_url?: string;
  public_profile_url?: string;
  network_distance?: string;
  verified?: boolean;
}

export interface LegacySearchResponse {
  object: string;
  items: LegacySearchResult[];
  cursor?: string | null;
  paging?: {
    start: number;
    page_count: number;
    total_count: number;
  };
}

export interface LegacyProfile {
  provider_id: string;
  public_identifier?: string;
  first_name?: string;
  last_name?: string;
  headline?: string;
  summary?: string;
  location?: string;
  industry?: string;
  profile_picture_url?: string;
  profile_picture_url_large?: string;
  background_picture_url?: string;
  profile_url?: string;
  network_distance?: string;
  is_premium?: boolean;
  is_influencer?: boolean;
  is_creator?: boolean;
  follower_count?: number;
  connections_count?: number;
  work_experience?: LegacyWorkExperience[];
  education?: LegacyEducation[];
  skills?: string[];
  positions?: LegacyWorkExperience[];
  educations?: LegacyEducation[];
}

export interface LegacyWorkExperience {
  title?: string;
  company?: string;
  company_name?: string;
  company_picture_url?: string;
  location?: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  is_current?: boolean;
}

export interface LegacyEducation {
  school?: string;
  school_name?: string;
  degree?: string;
  field_of_study?: string;
  start_date?: string;
  end_date?: string;
}

export interface LegacyAccount {
  id: string;
  provider?: string;
  type?: "classic" | "premium" | "sales_navigator";
  name?: string;
  status?: string;
  connection_params?: {
    im?: {
      id?: string;
      publicIdentifier?: string;
      username?: string;
      premiumFeatures?: string[];
    };
  };
}

export interface LegacyInviteResponse {
  object: string;
  provider_id?: string;
}

export interface LegacyMessage {
  id: string;
  text?: string;
  sender_provider_id?: string;
  created_at?: string;
}
