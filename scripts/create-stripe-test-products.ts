/* ── Legt 1:1 die Live-Products in Stripe TEST-Mode an ──
 *
 * Run:
 *   $env:STRIPE_TEST_SECRET_KEY="sk_test_..."
 *   npx tsx scripts/create-stripe-test-products.ts
 *
 * Output: Kopier-fertige Env-Vars für .env.local
 */

import Stripe from "stripe";
import { config } from "dotenv";

config({ path: ".env.local" });

const key = process.env.STRIPE_TEST_SECRET_KEY ?? process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("FEHLT: STRIPE_TEST_SECRET_KEY (oder STRIPE_SECRET_KEY) in .env.local");
  process.exit(1);
}
if (!key.startsWith("sk_test_")) {
  console.error("ERROR: Key startet nicht mit sk_test_ — dieses Script erstellt nur Test-Products!");
  console.error("       Wenn du Live-Products willst: nutz Stripe MCP oder Dashboard.");
  process.exit(1);
}

const stripe = new Stripe(key, { apiVersion: "2026-04-22.dahlia", typescript: true });

interface ProductSpec {
  envName:     string;
  name:        string;
  description: string;
  unitAmount:  number;    // in cents
  recurring:   boolean;
}

const SPECS: ProductSpec[] = [
  { envName: "STRIPE_PRICE_SOLO",        name: "KI Kanzlei — Solo",   description: "Solo-Plan · 2.000 Credits / Monat",  unitAmount:  19900, recurring: true },
  { envName: "STRIPE_PRICE_GROWTH",      name: "KI Kanzlei — Growth", description: "Growth-Plan · 6.000 Credits / Monat", unitAmount:  49900, recurring: true },
  { envName: "STRIPE_PRICE_SCALE",       name: "KI Kanzlei — Scale",  description: "Scale-Plan · 18.000 Credits / Monat", unitAmount: 119900, recurring: true },
  { envName: "STRIPE_PRICE_PACK_SMALL",  name: "Credit-Pack Small",   description: "1.000 Credits Top-Up",                unitAmount:  14900, recurring: false },
  { envName: "STRIPE_PRICE_PACK_MEDIUM", name: "Credit-Pack Medium",  description: "5.000 Credits Top-Up",                unitAmount:  59900, recurring: false },
  { envName: "STRIPE_PRICE_PACK_LARGE",  name: "Credit-Pack Large",   description: "15.000 Credits Top-Up",               unitAmount: 149900, recurring: false },
];

async function main() {
  console.log("Erstelle Test-Mode Products für ki-kanzlei.at ...\n");
  const results: { env: string; priceId: string }[] = [];

  for (const spec of SPECS) {
    process.stdout.write(`  ${spec.name} ... `);
    const product = await stripe.products.create({
      name:        spec.name,
      description: spec.description,
    });
    const price = await stripe.prices.create({
      product:     product.id,
      currency:    "eur",
      unit_amount: spec.unitAmount,
      ...(spec.recurring ? { recurring: { interval: "month" } } : {}),
    });
    results.push({ env: spec.envName, priceId: price.id });
    console.log(`✓ ${price.id}`);
  }

  console.log("\n──────────────────────────────────────────────────");
  console.log("In deine .env.local kopieren (Test-Mode):");
  console.log("──────────────────────────────────────────────────");
  for (const r of results) {
    console.log(`${r.env}=${r.priceId}`);
  }
  console.log("──────────────────────────────────────────────────\n");
  console.log("Plus diese Test-Mode-Keys brauchst du:");
  console.log("  STRIPE_SECRET_KEY=sk_test_...              (aus Dashboard → Test mode → API keys)");
  console.log("  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...");
  console.log("  STRIPE_WEBHOOK_SECRET=whsec_test_...       (aus `stripe listen` Output)");
}

main().catch((err) => {
  console.error("\nFehler:", err);
  process.exit(1);
});
