/* ── API Route: POST /api/social-media/upload-logo ── */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Keine Datei" }, { status: 400 });
    }

    // Validate file type
    const allowed = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: "Nur PNG, JPG, SVG oder WebP erlaubt" }, { status: 400 });
    }

    // Max 2MB
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "Datei zu groß (max. 2MB)" }, { status: 400 });
    }

    const ext = file.name.split(".").pop() ?? "png";
    const path = `${user.id}/logo.${ext}`;

    // Upload (upsert to overwrite existing)
    const { error: uploadError } = await supabase.storage
      .from("brand-assets")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      console.error("[Upload Logo]", uploadError);
      return NextResponse.json({ error: "Upload fehlgeschlagen" }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("brand-assets")
      .getPublicUrl(path);

    // Add cache-buster
    const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    return NextResponse.json({ data: { url: publicUrl } });
  } catch (error) {
    console.error("[API /api/social-media/upload-logo]", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
