"use client";

import { useEffect, useState } from "react";

interface DashGreetingProps {
  firstName: string;
  newReplies: number;
  urgentTasks: number;
}

function buildGreeting() {
  const h = new Date().getHours();
  if (h < 11) return "Guten Morgen";
  if (h < 18) return "Hallo";
  return "Guten Abend";
}

export function DashGreeting({ firstName, newReplies, urgentTasks }: DashGreetingProps) {
  // Avoid SSR/CSR mismatch — pick greeting only after hydration
  const [greeting, setGreeting] = useState("Hallo");
  useEffect(() => { setGreeting(buildGreeting()); }, []);

  const parts: string[] = [];
  if (newReplies > 0) parts.push(`${newReplies} neue Antwort${newReplies === 1 ? "" : "en"}`);
  if (urgentTasks > 0) parts.push(`${urgentTasks} dringende Aufgabe${urgentTasks === 1 ? "" : "n"}`);

  return (
    <div>
      <h1>{greeting}, {firstName} <span aria-hidden>👋</span></h1>
      {parts.length > 0 ? (
        <p className="sub">
          Du hast {parts.map((p, i) => (
            <span key={i}>
              {i > 0 && " und "}
              <b style={{ color: "var(--foreground)", fontWeight: 600 }}>{p}</b>
            </span>
          ))}.
        </p>
      ) : (
        <p className="sub">Alles erledigt — Zeit für eine neue Lead-Suche.</p>
      )}
    </div>
  );
}
