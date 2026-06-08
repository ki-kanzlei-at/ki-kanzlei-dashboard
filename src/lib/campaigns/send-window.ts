/* ── Globales Versandfenster (reine Logik, client- & server-safe) ──
 *
 * Spiegelt das Subset von CampaignSchedule (days/time_from/time_to/timezone),
 * damit der Cron-Job das globale Fenster 1:1 als Fallback verwenden kann.
 * Bewusst ohne Server-Imports, damit es auch im Client-Bundle (SettingsModal)
 * landen darf.
 */

export interface SendWindow {
  days: boolean[];      // Länge 7, Mo..So
  time_from: string;    // "09:00"
  time_to: string;      // "17:00"
  timezone: string;     // "Europe/Vienna"
}

export const DEFAULT_SEND_WINDOW: SendWindow = {
  days: [true, true, true, true, true, false, false], // Mo–Fr
  time_from: "09:00",
  time_to: "17:00",
  timezone: "Europe/Vienna",
};

/** Macht aus dem alten String-Preset oder einem Teilobjekt ein vollständiges SendWindow. */
export function normalizeSendWindow(
  raw: SendWindow | string | null | undefined,
): SendWindow {
  if (raw && typeof raw === "object") {
    return {
      days: Array.isArray(raw.days) && raw.days.length === 7 ? raw.days : DEFAULT_SEND_WINDOW.days,
      time_from: raw.time_from || DEFAULT_SEND_WINDOW.time_from,
      time_to: raw.time_to || DEFAULT_SEND_WINDOW.time_to,
      timezone: raw.timezone || DEFAULT_SEND_WINDOW.timezone,
    };
  }
  switch (raw) {
    case "extended":
      return { days: [true, true, true, true, true, false, false], time_from: "08:00", time_to: "20:00", timezone: "Europe/Vienna" };
    case "always":
      return { days: [true, true, true, true, true, true, true], time_from: "00:00", time_to: "23:59", timezone: "Europe/Vienna" };
    case "business":
    default:
      return { ...DEFAULT_SEND_WINDOW };
  }
}

/** Ist `date` (Standard: jetzt) innerhalb des Fensters? Nutzt die TZ des Fensters. */
export function isWithinSendWindow(win: SendWindow, date: Date = new Date()): boolean {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: win.timezone || "Europe/Vienna",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);

    const dayIdx = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday);
    if (dayIdx < 0) return true;
    if (!win.days[dayIdx]) return false;

    const minutes = hour * 60 + minute;
    const [fH, fM] = (win.time_from || "09:00").split(":").map(Number);
    const [tH, tM] = (win.time_to || "17:00").split(":").map(Number);
    const fromMin = fH * 60 + (fM || 0);
    const toMin = tH * 60 + (tM || 0);
    return minutes >= fromMin && minutes < toMin;
  } catch {
    return true;
  }
}
