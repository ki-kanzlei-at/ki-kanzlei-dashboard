/* Discovery-Test der JustizOnline HVD-Firmenbuch-SOAP-API. */
import { config } from "dotenv";
config({ path: ".env.local" });

const ENDPOINT = "https://justizonline.gv.at/jop/api/at.gv.justiz.fbw/ws";
const TOKEN = process.env.JUSTIZONLINE_IWG_TOKEN || "";

async function soap(bodyXml: string): Promise<{ status: number; text: string }> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/soap+xml;charset=UTF-8",
      SOAPAction: '""',
      "X-Api-Key": TOKEN,
    },
    body: bodyXml,
  });
  return { status: res.status, text: await res.text() };
}

const searchBody = (wortlaut: string) => `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:suc="ns://firmenbuch.justiz.gv.at/Abfrage/SucheFirmaRequest">
  <soap:Header/>
  <soap:Body>
    <suc:SUCHEFIRMAREQUEST>
      <suc:FIRMENWORTLAUT>${wortlaut}</suc:FIRMENWORTLAUT>
      <suc:EXAKTESUCHE>false</suc:EXAKTESUCHE>
      <suc:SUCHBEREICH>1</suc:SUCHBEREICH>
      <suc:GERICHT></suc:GERICHT>
      <suc:RECHTSFORM></suc:RECHTSFORM>
      <suc:RECHTSEIGENSCHAFT></suc:RECHTSEIGENSCHAFT>
      <suc:ORTNR></suc:ORTNR>
    </suc:SUCHEFIRMAREQUEST>
  </soap:Body>
</soap:Envelope>`;

const auszugBody = (fnr: string) => `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:aus="ns://firmenbuch.justiz.gv.at/Abfrage/v2/AuszugRequest">
  <soap:Header/>
  <soap:Body>
    <aus:AUSZUG_V2_REQUEST>
      <aus:FNR>${fnr}</aus:FNR>
      <aus:STICHTAG>${new Date().toISOString().slice(0, 10)}</aus:STICHTAG>
      <aus:UMFANG>Kurzinformation</aus:UMFANG>
    </aus:AUSZUG_V2_REQUEST>
  </soap:Body>
</soap:Envelope>`;

async function main() {
  if (!TOKEN) { console.error("❌ Kein JUSTIZONLINE_IWG_TOKEN"); process.exit(1); }
  console.log("Token-Länge:", TOKEN.length);
  const q = process.argv.slice(2).find((a) => !a.startsWith("--")) || "LBG Österreich";
  console.log(`\n=== SUCHEFIRMAREQUEST: ${q} ===`);
  const r = await soap(searchBody(q));
  console.log("HTTP", r.status);
  const fnr = r.text.match(/<[^:>]*:?FNR>([^<]+)<\/[^:>]*:?FNR>/)?.[1];
  console.log("Erste FNR:", fnr);
  if (fnr) {
    console.log(`\n=== AUSZUG_V2_REQUEST: ${fnr} ===`);
    const a = await soap(auszugBody(fnr));
    console.log("HTTP", a.status);
    console.log(a.text.slice(0, 9000));
  }
}
main().catch((e) => { console.error("ERR", e); process.exit(1); });
