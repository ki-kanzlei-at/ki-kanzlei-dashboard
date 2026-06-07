"use client";

import { useRouter } from "next/navigation";
import SettingsModal from "@/components/settings/SettingsModal";

/**
 * Fallback-Route für Direktaufruf/Reload von `/dashboard/settings`.
 * Im Normalfall (Soft-Navigation aus dem Dashboard) übernimmt die
 * Intercepting-Route `@modal/(.)settings` und legt das Modal über die
 * aktuelle Seite. Hier schließt das Modal zurück aufs Dashboard.
 */
export default function SettingsPage() {
  const router = useRouter();
  return <SettingsModal onClose={() => router.push("/dashboard")} />;
}
