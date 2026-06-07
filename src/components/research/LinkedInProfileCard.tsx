"use client";

import { useState } from "react";
import { Linkedin, Clock, Plus, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { avatarColor } from "./shared";
import type { ResearchPerson } from "@/types/research";

/** Schlanke, gespeicherte LinkedIn-Profilkarte im Chat. Daten kommen aus der
 *  Nachricht (kein eigener Fetch) — nur „Vernetzen" ist interaktiv. */
export function LinkedInProfileCard({ person, company }: { person: ResearchPerson; company: string }) {
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);

  async function connect() {
    if (connecting || connected) return;
    setConnecting(true);
    try {
      const res = await fetch("/api/research/connect", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: person.public_identifier || person.provider_id || person.id,
          profileUrl: person.profile_url || person.public_profile_url,
          fullName: person.name,
          firstName: person.first_name,
          lastName: person.last_name,
          headline: person.headline,
          location: person.location,
          profilePicture: person.profile_picture_url,
          company,
        }),
      });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || "Vernetzen fehlgeschlagen"); return; }
      setConnected(true);
      toast.success("Vernetzungsanfrage gesendet");
    } catch {
      toast.error("Vernetzen fehlgeschlagen");
    } finally {
      setConnecting(false);
    }
  }

  const profileUrl = person.profile_url || person.public_profile_url;
  // Defensiv: ältere Datensätze können location/headline als Objekt enthalten.
  const asText = (v: unknown): string => {
    if (typeof v === "string") return v;
    if (v && typeof v === "object") { const o = v as Record<string, unknown>; const c = o.geoLocationName ?? o.name ?? o.text; return typeof c === "string" ? c : ""; }
    return "";
  };
  const headline = asText(person.headline);
  const location = asText(person.location);

  return (
    <div className="air-li-wrap">
      <div className="air-li-card">
        {person.profile_picture_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="air-li-pic" src={person.profile_picture_url} alt="" />
        ) : (
          <span className="air-li-pic" style={{ background: avatarColor(person.name || "?") }}>{(person.name || "?")[0]}</span>
        )}
        <div className="air-li-info">
          <div className="air-li-name">{person.name}</div>
          {headline && <div className="air-li-head">{headline}</div>}
          {location && <div className="air-li-loc"><MapPin width={11} height={11} /> {location}</div>}
        </div>
        <div className="air-li-actions">
          {profileUrl && (
            <a className="icon-btn icon-btn-outline" href={profileUrl} target="_blank" rel="noreferrer" title="LinkedIn-Profil öffnen"><Linkedin width={15} height={15} /></a>
          )}
          {connected ? (
            <button className="btn btn-outline btn-sm" disabled><Clock width={14} height={14} /> Ausstehend</button>
          ) : (
            <button className="btn btn-default btn-sm" onClick={connect} disabled={connecting}>
              {connecting ? <Loader2 width={14} height={14} style={{ animation: "air-spin .7s linear infinite" }} /> : <><Plus width={14} height={14} /> Vernetzen</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
