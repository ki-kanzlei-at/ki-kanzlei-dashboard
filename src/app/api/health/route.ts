import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const startedAt = Date.now();

export async function GET() {
  const uptime = Math.floor((Date.now() - startedAt) / 1000);

  // DB health check
  let dbStatus = "ok";
  try {
    const { error } = await getSupabaseAdmin()
      .from("leads")
      .select("id")
      .limit(1);
    if (error) dbStatus = `error: ${error.message}`;
  } catch (err) {
    dbStatus = `unreachable: ${err instanceof Error ? err.message : "unknown"}`;
  }

  const healthy = dbStatus === "ok";

  return NextResponse.json(
    {
      status: healthy ? "healthy" : "degraded",
      uptime,
      database: dbStatus,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "0.1.0",
    },
    { status: healthy ? 200 : 503 },
  );
}
