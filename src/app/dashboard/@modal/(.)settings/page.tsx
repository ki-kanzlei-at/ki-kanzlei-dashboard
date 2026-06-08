"use client";

import { useRouter } from "next/navigation";
import SettingsModal from "@/components/settings/SettingsModal";

/**
 * Intercepting-Route: fängt die Soft-Navigation zu `/dashboard/settings` ab
 * und legt das Settings-Popup über die aktuell gemountete Dashboard-Seite.
 * Schließen → `router.back()`, damit der Hintergrund nahtlos wieder erscheint.
 */
export default function SettingsModalRoute() {
  const router = useRouter();
  return <SettingsModal onClose={() => router.back()} />;
}
