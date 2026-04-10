/* ── DNS Health Check: SPF, DKIM, DMARC, MX ── */

export interface DnsCheckResult {
  domain: string;
  mx: { ok: boolean; records: string[]; error?: string };
  spf: { ok: boolean; record?: string; error?: string };
  dmarc: { ok: boolean; record?: string; error?: string };
  overall: "good" | "warning" | "bad";
}

/**
 * Prüft DNS-Records einer Domain via öffentliche DNS-over-HTTPS APIs.
 */
export async function checkDomainDns(domain: string): Promise<DnsCheckResult> {
  const result: DnsCheckResult = {
    domain,
    mx: { ok: false, records: [] },
    spf: { ok: false },
    dmarc: { ok: false },
    overall: "bad",
  };

  try {
    // MX Records
    const mxData = await queryDns(domain, "MX");
    if (mxData.length > 0) {
      result.mx = { ok: true, records: mxData.map((r) => r.data || r.exchange || String(r)).slice(0, 5) };
    } else {
      result.mx = { ok: false, records: [], error: "Keine MX-Records gefunden" };
    }

    // SPF (TXT record starting with "v=spf1")
    const txtData = await queryDns(domain, "TXT");
    const spfRecord = txtData.find((r) => {
      const val = typeof r === "string" ? r : r.data || "";
      return val.toLowerCase().startsWith("v=spf1");
    });
    if (spfRecord) {
      const val = typeof spfRecord === "string" ? spfRecord : spfRecord.data || "";
      result.spf = { ok: true, record: val };
    } else {
      result.spf = { ok: false, error: "Kein SPF-Record gefunden" };
    }

    // DMARC (TXT record at _dmarc.domain)
    const dmarcData = await queryDns(`_dmarc.${domain}`, "TXT");
    const dmarcRecord = dmarcData.find((r) => {
      const val = typeof r === "string" ? r : r.data || "";
      return val.toLowerCase().startsWith("v=dmarc1");
    });
    if (dmarcRecord) {
      const val = typeof dmarcRecord === "string" ? dmarcRecord : dmarcRecord.data || "";
      result.dmarc = { ok: true, record: val };
    } else {
      result.dmarc = { ok: false, error: "Kein DMARC-Record gefunden" };
    }

    // Overall score
    const checks = [result.mx.ok, result.spf.ok, result.dmarc.ok];
    const passed = checks.filter(Boolean).length;
    if (passed === 3) result.overall = "good";
    else if (passed >= 1) result.overall = "warning";
    else result.overall = "bad";
  } catch (err) {
    console.error("[DNS Check]", err);
  }

  return result;
}

async function queryDns(name: string, type: string): Promise<Array<{ data?: string; exchange?: string }>> {
  try {
    // Google Public DNS-over-HTTPS
    const res = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.Answer || !Array.isArray(data.Answer)) return [];
    return data.Answer.map((a: { data?: string }) => ({
      data: a.data?.replace(/^"|"$/g, "") || "",
    }));
  } catch {
    return [];
  }
}
