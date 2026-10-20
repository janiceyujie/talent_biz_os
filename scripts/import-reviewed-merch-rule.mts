/** Explicit, local-only reviewed release. Running again never extends its dates. */
import env from "@next/env";
import { createHash } from "node:crypto";
import { usStates } from "../lib/invoices/tax";
env.loadEnvConfig(process.cwd());
const target = new URL(process.env.DATABASE_URL || "invalid:");
if (process.env.APP_ENV !== "development" || !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) throw new Error("Local development database required");
const { db } = await import("../lib/db");
const { taxServiceRule: rules, taxSource: source } = await import("../lib/db/schema");
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
try {
  await db.transaction(async tx => {
    for (const state of usStates) {
      await tx.insert(source).values({ state, directoryUrl: "https://taxadmin.org/tax-agencies/" }).onConflictDoNothing();
      const pending = { state, category: "ticketAdmissions", delivery: "any", status: "pending", treatment: "unknown", conditions: ["Separate state and local admission or amusement taxes require review."] };
      await tx.insert(rules).values({ ...pending, contentHash: hash(pending) }).onConflictDoNothing();
    }
    const rule = {
      state: "CA", category: "merchandise", delivery: "physical", status: "reviewed", treatment: "taxable",
      sourceUrl: "https://cdtfa.ca.gov/industry/gig-economy/", validFrom: "2026-10-19", validThrough: "2026-11-18", reviewedAt: new Date("2026-10-19T00:00:00Z"),
      conditions: [
        "Source: Working in the Gig Economy; ordinary tangible personal property retail sales are taxable unless specifically exempt.",
        "California seller, California retail location, ordinary shirts, CDs or posters handed over at that location; no shipping or delivery.",
        "No food, drinks, special goods, resale or other exemption, marketplace collection, services or admission bundled into the price.",
        "Seller confirms registration, collection obligation and exact jurisdiction. A current combined rate is mandatory; component rates are never added blindly.",
        "Application enforces merchandiseScope=ordinaryInPerson and physical delivery. This review window is not a statutory commencement or expiry date.",
      ],
    };
    await tx.insert(rules).values({ ...rule, contentHash: hash(rule) }).onConflictDoNothing();
  });
  console.log(JSON.stringify({ database: target.pathname.slice(1), reviewedMerchandiseStates: ["CA"], admissionStatesPending: 51 }));
} finally { await (globalThis as unknown as { pgClient?: { end(): Promise<void> } }).pgClient?.end(); }
