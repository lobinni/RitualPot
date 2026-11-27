import {
  type Address,
  type TxStage,
  readContract,
  writeAndWait,
} from "./chain";
import { isAddress } from "./config";

/** The shapes the contract returns. Every view answers with a JSON string. */

export type Pot = {
  pot_id: string;
  creator: string;
  title: string;
  goal: string;
  periods: number;
  period_len: number;
  stake: string;
  max_members: number;
  rounds_required: number;
  round_interval: number;
  join_window: number;
  ruling_window: number;
  created_at: number;
  join_closes_at: number;
  final_deadline: number;
  status: "open" | "final" | "void";
  member_count: number;
  member_addrs: string[];
  settled_at: number;
  paid_out: string;
  injection_flags: string[];
};

export type Proof = {
  member: number;
  period: number;
  entrant: string;
  url: string;
  note: string;
  text: string;
  content_hash: string;
  total_chars: number;
  proved_at: number;
  rounds: number;
  last_round_at: number;
  standing: { verdict: string; confirmations: number };
  final_verdict: string;
};

export type RoundRecord = {
  pot_id: string;
  member: number;
  period: number;
  round: number;
  at: number;
  at_text: string;
  by: string;
  proof_hash: string;
  finding: "ruled" | "unclear";
  reason: string;
  verdict: string;
  outcome: "proposed" | "confirmed" | "restarted" | "final" | "no_progress";
  confirmations: number;
  final_verdict: string;
  injection_flags: string[];
};

export type Schedule = {
  pot_id: string;
  now: number;
  status: string;
  members: number;
  join_closes_at: number;
  periods_end: number;
  final_deadline: number;
  current_period: number;
  can_join: boolean;
  can_prove: boolean;
  can_rule: boolean;
  unruled: number;
  next_round_at: number;
  can_settle: boolean;
  can_withdraw: boolean;
};

export type PayoutRow = {
  index: number;
  address: string;
  done: number;
  refund: string;
  bonus: string;
  payout: string;
  withdrawn: boolean;
};

export type Payouts = { settled: boolean; status: string; rows: PayoutRow[] };
export type Books = { balance: string; held: string; credits: string };
export type EventRow = { event: string; n: number; [key: string]: unknown };
export type PageOf<T> = { total: number; offset: number; items: T[] };

type OnStage = (stage: TxStage, hash: string) => void;

/** The address in use, injected once by the console from the deployment record. */
let activeAddress: `0x${string}` | null = null;

export function setActiveAddress(address: `0x${string}` | null) {
  activeAddress = address;
}

export function getActiveAddress(): `0x${string}` | null {
  return activeAddress;
}

function requireAddress(): `0x${string}` {
  if (!isAddress(activeAddress)) {
    throw new Error(
      "No contract address is recorded for this network yet. Set one in deployments/registry.json or through the deployment endpoint.",
    );
  }
  return activeAddress;
}

const read = (fn: string, args: (string | number)[] = []) =>
  readContract<string>(requireAddress(), fn, args as never[]);

export const PAGE_SIZE = 20;

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** One page of [pot_id, status]. Never the whole registry. */
export async function listPots(
  offset: number,
  limit = PAGE_SIZE,
): Promise<PageOf<[string, string]>> {
  return parseJson(await read("list_pots", [offset, limit]), { total: 0, offset, items: [] });
}

export async function getPot(id: string): Promise<Pot | null> {
  try {
    const pot = parseJson<Pot>(await read("get_pot", [id]), {} as Pot);
    return pot.pot_id ? pot : null;
  } catch {
    return null;
  }
}

export async function getProof(
  id: string,
  member: number,
  period: number,
): Promise<Proof | null> {
  try {
    const record = parseJson<Proof>(await read("get_proof", [id, member, period]), {} as Proof);
    return typeof record.member === "number" ? record : null;
  } catch {
    return null;
  }
}

export async function getRound(
  id: string,
  member: number,
  period: number,
  round: number,
): Promise<RoundRecord | null> {
  try {
    const record = parseJson<RoundRecord>(
      await read("get_round", [id, member, period, round]),
      {} as RoundRecord,
    );
    return record.pot_id ? record : null;
  } catch {
    return null;
  }
}

export async function getSchedule(id: string): Promise<Schedule | null> {
  try {
    const schedule = parseJson<Schedule>(await read("get_schedule", [id]), {} as Schedule);
    return schedule.pot_id ? schedule : null;
  } catch {
    return null;
  }
}

export async function getPayouts(id: string): Promise<Payouts> {
  return parseJson<Payouts>(await read("get_payouts", [id]), {
    settled: false,
    status: "",
    rows: [],
  });
}

export async function getBooks(): Promise<Books | null> {
  try {
    return parseJson<Books>(await read("get_balance"), null as unknown as Books);
  } catch {
    return null;
  }
}

export async function countPots(): Promise<number | null> {
  try {
    return Number(await readContract<string>(requireAddress(), "count_pots", []));
  } catch {
    return null;
  }
}

export async function countEvents(): Promise<number | null> {
  try {
    return Number(await readContract<string>(requireAddress(), "count_events", []));
  } catch {
    return null;
  }
}

/** The newest events: the last page of the paged event log. */
export async function getRecentEvents(count = 8): Promise<EventRow[]> {
  try {
    const head = parseJson<PageOf<EventRow>>(await read("get_events", [0, 1]), {
      total: 0,
      offset: 0,
      items: [],
    });
    const start = Math.max(0, head.total - count);
    const page = parseJson<PageOf<EventRow>>(await read("get_events", [start, count]), {
      total: 0,
      offset: 0,
      items: [],
    });
    return page.items.slice().reverse();
  } catch {
    return [];
  }
}

export async function getCredit(address: string): Promise<bigint> {
  try {
    return BigInt((await read("get_credit", [address])) || "0");
  } catch {
    return BigInt(0);
  }
}

export type NewPot = {
  id: string;
  title: string;
  goal: string;
  periods: string;
  periodLen: string;
  /** The stake in wei. */
  stake: string;
  maxMembers: string;
  rounds: string;
  interval: string;
  joinWindow: string;
  rulingWindow: string;
};

export async function openPot(
  account: Address,
  provider: unknown,
  pot: NewPot,
  on?: OnStage,
) {
  return writeAndWait(
    account,
    provider,
    requireAddress(),
    "open_pot",
    [
      pot.id,
      pot.title,
      pot.goal,
      pot.periods,
      pot.periodLen,
      pot.stake,
      pot.maxMembers,
      pot.rounds,
      pot.interval,
      pot.joinWindow,
      pot.rulingWindow,
    ],
    on,
  );
}

/** The stake travels as the transaction's value. */
export async function join(
  account: Address,
  provider: unknown,
  id: string,
  stakeWei: string,
  on?: OnStage,
) {
  return writeAndWait(
    account,
    provider,
    requireAddress(),
    "join",
    [id],
    on,
    BigInt(stakeWei || "0"),
  );
}

export async function prove(
  account: Address,
  provider: unknown,
  id: string,
  url: string,
  note: string,
  on?: OnStage,
) {
  return writeAndWait(account, provider, requireAddress(), "prove", [id, url, note], on);
}

export async function rule(
  account: Address,
  provider: unknown,
  id: string,
  member: number,
  period: number,
  on?: OnStage,
) {
  return writeAndWait(account, provider, requireAddress(), "rule", [id, member, period], on);
}

const simple =
  (fn: string) =>
  (account: Address, provider: unknown, id: string, on?: OnStage) =>
    writeAndWait(account, provider, requireAddress(), fn, [id], on);

export const settle = simple("settle");
export const withdrawMember = simple("withdraw_member");

export async function withdrawCredit(
  account: Address,
  provider: unknown,
  on?: OnStage,
) {
  return writeAndWait(account, provider, requireAddress(), "withdraw_credit", [], on);
}
