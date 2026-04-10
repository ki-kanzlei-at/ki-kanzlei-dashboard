/* ── Social Media Publisher ── */

import { LinkedInClient } from "./linkedin-client";
import { MetaGraphClient } from "./meta-client";
import type { SocialMediaAccount, SocialMediaPost } from "@/types/social-media";

export interface PublishResult {
  account_id: string;
  platform: string;
  success: boolean;
  post_id?: string;
  error?: string;
}

/**
 * Publish a post to a single account.
 * Dispatches to the correct platform client.
 */
export async function publishToAccount(
  account: SocialMediaAccount,
  post: SocialMediaPost,
): Promise<PublishResult> {
  const caption = [
    post.caption ?? "",
    ...(post.tags?.map((t) => `#${t}`) ?? []),
  ]
    .filter(Boolean)
    .join("\n");

  try {
    switch (account.platform) {
      case "linkedin": {
        if (!account.access_token) throw new Error("Kein Access Token");
        const client = new LinkedInClient(account.access_token);
        const authorUrn = `urn:li:person:${account.platform_user_id}`;
        const result = await client.publishPost(authorUrn, caption, post.image_url ?? undefined);
        return {
          account_id: account.id,
          platform: "linkedin",
          success: true,
          post_id: result.id,
        };
      }

      case "facebook": {
        const token = account.page_access_token || account.access_token;
        if (!token) throw new Error("Kein Access Token");
        if (!account.page_id) throw new Error("Keine Page-ID");
        const client = new MetaGraphClient(token);
        const result = await client.publishToFacebook(
          account.page_id,
          caption,
          post.image_url ?? undefined,
        );
        return {
          account_id: account.id,
          platform: "facebook",
          success: true,
          post_id: result.id,
        };
      }

      case "instagram": {
        const token = account.page_access_token || account.access_token;
        if (!token) throw new Error("Kein Access Token");
        if (!account.instagram_business_account_id) throw new Error("Kein Instagram Business Account");
        if (!post.image_url) throw new Error("Instagram benötigt ein Bild");
        const client = new MetaGraphClient(token);
        const result = await client.publishToInstagram(
          account.instagram_business_account_id,
          caption,
          post.image_url,
        );
        return {
          account_id: account.id,
          platform: "instagram",
          success: true,
          post_id: result.id,
        };
      }

      default:
        return {
          account_id: account.id,
          platform: account.platform,
          success: false,
          error: "Unbekannte Plattform",
        };
    }
  } catch (err) {
    return {
      account_id: account.id,
      platform: account.platform,
      success: false,
      error: err instanceof Error ? err.message : "Unbekannter Fehler",
    };
  }
}
