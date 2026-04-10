/* ── LinkedIn API Client ── */

export class LinkedInClient {
  private accessToken: string;
  private baseUrl = "https://api.linkedin.com/v2";

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private headers(extra?: Record<string, string>) {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
      ...extra,
    };
  }

  /** Test connection by fetching the user profile */
  async testConnection(): Promise<{ ok: boolean; name?: string; error?: string }> {
    try {
      const res = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: this.headers(),
      });
      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
      }
      const data = await res.json();
      return { ok: true, name: data.name ?? data.given_name };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Unbekannter Fehler" };
    }
  }

  /** Get user profile (sub = person URN) */
  async getProfile(): Promise<{ sub: string; name: string; picture?: string; email?: string }> {
    const res = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`LinkedIn profile error: ${res.status}`);
    return res.json();
  }

  /** Upload an image and get the asset URN */
  async uploadImage(authorUrn: string, imageUrl: string): Promise<string> {
    // Step 1: Register upload
    const registerRes = await fetch(`${this.baseUrl}/assets?action=registerUpload`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
          owner: authorUrn,
          serviceRelationships: [
            {
              relationshipType: "OWNER",
              identifier: "urn:li:userGeneratedContent",
            },
          ],
        },
      }),
    });
    if (!registerRes.ok) throw new Error(`LinkedIn register upload error: ${registerRes.status}`);
    const registerData = await registerRes.json();

    const uploadUrl =
      registerData.value?.uploadMechanism?.[
        "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
      ]?.uploadUrl;
    const asset = registerData.value?.asset;

    if (!uploadUrl || !asset) throw new Error("LinkedIn upload registration failed");

    // Step 2: Download image and upload to LinkedIn
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`Failed to download image: ${imgRes.status}`);
    const imgBuffer = await imgRes.arrayBuffer();

    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/octet-stream",
      },
      body: imgBuffer,
    });
    if (!uploadRes.ok) throw new Error(`LinkedIn image upload error: ${uploadRes.status}`);

    return asset;
  }

  /** Publish a text post (optionally with image) */
  async publishPost(
    authorUrn: string,
    text: string,
    imageUrl?: string,
  ): Promise<{ id: string }> {
    const body: Record<string, unknown> = {
      author: authorUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text },
          shareMediaCategory: imageUrl ? "IMAGE" : "NONE",
          ...(imageUrl
            ? {
                media: [
                  {
                    status: "READY",
                    media: await this.uploadImage(authorUrn, imageUrl),
                  },
                ],
              }
            : {}),
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    };

    const res = await fetch(`${this.baseUrl}/ugcPosts`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`LinkedIn publish error: ${res.status} - ${errText.slice(0, 300)}`);
    }

    const data = await res.json();
    return { id: data.id };
  }
}
