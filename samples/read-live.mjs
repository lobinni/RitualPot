#!/usr/bin/env node
/**
 * Reads the live RitualPot contract and prints what it actually holds right now.
 *
 * The address is resolved the same way the console resolves it:
 *   RITUALPOT_ADDRESS -> deployments/registry.json (RITUALPOT_NETWORK or defaultNetwork)
 * With no address recorded the script exits instead of showing sample data.
 *
 *   node samples/read-live.mjs
 *   RITUALPOT_NETWORK=studio-dev node samples/read-live.mjs
 */

import { readFileSync } from "node:fs";
import { createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";

const registry = JSON.parse(readFileSync(new URL("../deployments/registry.json", import.meta.url), "utf8"));
const wanted = process.env.RITUALPOT_NETWORK || registry.defaultNetwork;
const network = (registry.networks || []).find((entry) => entry.id === wanted) || (registry.networks || [])[0];

const address = process.env.RITUALPOT_ADDRESS || network?.address || null;
const rpc = process.env.RITUALPOT_RPC || network?.rpcUrl || null;

if (!address) {
  console.error(`No contract address recorded for "${network?.id ?? "unknown"}".`);
  console.error("Record it in deployments/registry.json, or pass RITUALPOT_ADDRESS.");
  process.exit(2);
}
if (!rpc) {
  console.error("No RPC url recorded for this network.");
  process.exit(2);
}

const client = createClient({
  chain: {
    ...studioDevnet,
    rpcUrls: { default: { http: [rpc] } },
  },
});

const read = (functionName, args = []) =>
  client.readContract({ address, functionName, args }).catch((error) => {
    console.error(`  ${functionName}: ${error?.message ?? error}`);
    return null;
  });

const asJson = (raw, fallback) => {
  if (typeof raw !== "string") return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const [countPots, countEvents, balanceRaw] = await Promise.all([
  read("count_pots"),
  read("count_events"),
  read("get_balance"),
]);

console.log(`network   ${network?.id} (chain ${network?.chainId})`);
console.log(`rpc       ${rpc}`);
console.log(`address   ${address}`);
console.log(`source    ${process.env.RITUALPOT_ADDRESS ? "environment" : "deployments/registry.json"}`);
console.log(`pots      ${countPots ?? "unreachable"}`);
console.log(`events    ${countEvents ?? "unreachable"}`);

const books = asJson(balanceRaw, null);
if (books) {
  console.log(`balance   ${books.balance}`);
  console.log(`held      ${books.held}`);
  console.log(`credits   ${books.credits}`);
}

const page = asJson(await read("list_pots", [0, 50]), null);
if (page && page.items?.length) {
  console.log("\nregistry");
  for (const [id, status] of page.items) console.log(`  ${status.padEnd(6)} ${id}`);
} else if (page) {
  console.log("\nregistry is empty on this deployment");
}

const total = typeof countEvents === "number" ? countEvents : 0;
if (total > 0) {
  const start = Math.max(0, total - 10);
  const events = asJson(await read("get_events", [start, 10]), null);
  if (events?.items?.length) {
    console.log(`\nnewest events (of ${events.total})`);
    for (const row of [...events.items].reverse()) {
      const who = row.member !== undefined ? ` member ${row.member}` : "";
      const period = row.period !== undefined ? ` period ${row.period}` : "";
      console.log(`  ${String(row.n).padStart(4)}  ${row.event}${who}${period}`);
    }
  }
}
