/* ── Meta Graph API Client (Facebook + Instagram) ── */

export class MetaGraphClient {
  private pageAccessToken: string;
  private baseUrl = "https://graph.facebook.com/v19.0";

  constructor(pageAccessToken: string) {
    this.pageAccessToken = pageAccessToken;
  }

  /** Test connection by fetching page info */
  async testConnection(pageId: string): Promise<{ ok: boolean; name?: string; error?: string }> {
    try {
      const res = await fetch(
        `${this.baseUrl}/${pageId}?fields=name,id&access_token=${this.pageAccessToken}`,
      );
      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
      }
      const data = await res.json();
      return { ok: true, name: data.name };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Unbekannter Fehler" };
    }
  }

  /** Publish a post to a Facebook Page */
  async publishToFacebook(
    pageId: string,
    message: string,
    imageUrl?: string,
  ): Promise<{ id: string }> {
    let url: string;
    const params = new URLSearchParams({ access_token: this.pageAccessToken });

    if (imageUrl) {
      url = `${this.baseUrl}/${pageId}/photos`;
      params.set("caption", message);
      params.set("url", imageUrl);
    } else {
      url = `${this.baseUrl}/${pageId}/feed`;
      params.set("message", message);
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Facebook publish error: ${res.status} - ${errText.slice(0, 300)}`);
    }

    const data = await res.json();
    return { id: data.id ?? data.post_id };
  }

  /** Publish a post to Instagram (requires image) */
  async publishToInstagram(
    igAccountId: string,
    caption: string,
    imageUrl: string,
  ): Promise<{ id: string }> {
    // Step 1: Create media container
    const containerRes = await fetch(
      `${this.baseUrl}/${igAccountId}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          image_url: imageUrl,
          caption,
          access_token: this.pageAccessToken,
        }).toString(),
      },
    );

    if (!containerRes.ok) {
      const errText = await containerRes.text();
      throw new Error(`Instagram container error: ${containerRes.status} - ${errText.slice(0, 300)}`);
    }

    const container = await containerRes.json();
    const containerId = container.id;

    // Step 2: Wait for processing (poll status)
    let retries = 0;
    while (retries < 30) {
      const statusRes = await fetch(
        `${this.baseUrl}/${containerId}?fields=status_code&access_token=${this.pageAccessToken}`,
      );
      const statusData = await statusRes.json();
      if (statusData.status_code === "FINISHED") break;
      if (statusData.status_code === "ERROR") {
        throw new Error("Instagram media processing failed");
      }
      retries++;
      await new Promise((r) => setTimeout(r, 2000));
    }

    // Step 3: Publish
    const publishRes = await fetch(
      `${this.baseUrl}/${igAccountId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          creation_id: containerId,
          access_token: this.pageAccessToken,
        }).toString(),
      },
    );

    if (!publishRes.ok) {
      const errText = await publishRes.text();
      throw new Error(`Instagram publish error: ${publishRes.status} - ${errText.slice(0, 300)}`);
    }

    const data = await publishRes.json();
    return { id: data.id };
  }
}
