import { createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import {
  TransactionStatus,
  type CalldataEncodable,
  type TransactionHash,
} from "genlayer-js/types";
import { CHAIN_ID, EXPLORER_BASE, NETWORK_ID, RPC_URL } from "./config";

export type Address = `0x${string}`;

type EthereumProvider = NonNullable<Parameters<typeof createClient>[0]>["provider"];

/**
 * The dev network, with its endpoints taken from the configuration so a move to
 * another network is a registry edit rather than a code change.
 */
export const studioChain = {
  ...studioDevnet,
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "Explorer", url: EXPLORER_BASE } },
} as typeof studioDevnet;

/**
 * The dev network rate-limits at roughly 30 requests per minute per address. Every read
 * goes through one serialized queue with a minimum spacing, and a rate-limited call
 * backs off and retries instead of surfacing the limit to the reader.
 */
const MIN_SPACING_MS = 250;
let queue: Promise<unknown> = Promise.resolve();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isRateLimited(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /rate limit|-32429|too many requests/i.test(message);
}

function enqueue<T>(run: () => Promise<T>): Promise<T> {
  const task = queue.then(async () => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await run();
      } catch (error) {
        if (attempt >= 4 || !isRateLimited(error)) throw error;
        await sleep(1500 * (attempt + 1));
      }
    }
  });
  queue = task.then(() => sleep(MIN_SPACING_MS)).catch(() => sleep(MIN_SPACING_MS));
  return task;
}

export function getReadClient() {
  return createClient({ chain: studioChain });
}

export function getWriteClient(account: Address, provider: EthereumProvider) {
  return createClient({ chain: studioChain, account, provider });
}

export async function readContract<T = unknown>(
  address: Address,
  functionName: string,
  args: CalldataEncodable[] = [],
): Promise<T> {
  const client = getReadClient();
  return enqueue(() => client.readContract({ address, functionName, args }) as Promise<T>);
}

/** Raw JSON-RPC, used for the faucet, balances and transaction polling. */
async function rpcOnce<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await response.json()) as { result?: T; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message || `${method} failed`);
  return body.result as T;
}

export async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  return enqueue(() => rpcOnce<T>(method, params));
}

/**
 * A transaction reaches ACCEPTED when the leader's result was agreed, and FINALIZED later,
 * when the appeal window closes. The two are different guarantees, so the caller is told
 * about each one instead of treating acceptance as completion.
 */
export type TxStage = "accepted" | "finalized";

export type WriteResult = {
  hash: string;
  /** Set once the chain reports the appeal window closed. */
  finalized: boolean;
};

/** The chain the connected wallet is actually on, read from the wallet itself. */
export async function getWalletChainId(provider: unknown): Promise<number | null> {
  try {
    const injected = provider as { request: (args: { method: string }) => Promise<unknown> };
    const hex = await injected.request({ method: "eth_chainId" });
    return Number(BigInt(String(hex)));
  } catch {
    return null;
  }
}

const NONCE_TOO_LOW = /NonceTooLow\(expected=(\d+),\s*actual=(\d+)\)/i;
const NETWORK_LABEL = NETWORK_ID;

/**
 * Turn a failure into a sentence a tester can act on. Every message below was written from an
 * error this console has actually received on the dev network.
 */
export function describeWriteError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);

  const nonce = raw.match(NONCE_TOO_LOW);
  if (nonce) {
    return (
      `The account's transaction counter is out of sync: the network expects nonce ${nonce[1]} ` +
      `but the wallet sent ${nonce[2]}. Nothing was spent. Switch the wallet to chain ${CHAIN_ID} ` +
      `(network "${NETWORK_LABEL}"), clear the wallet's activity and nonce cache, then send again. ` +
      `If it persists, use an account that has not been sending on this network.`
    );
  }
  if (/insufficient funds|balance is too low/i.test(raw)) {
    return "The account does not hold enough value for the stake plus the fee. Fund it from the faucet and send again.";
  }
  if (/user (rejected|denied)|rejected the request/i.test(raw)) {
    return "The wallet rejected the request before sending it.";
  }
  if (/rate limit|-32429|too many requests/i.test(raw)) {
    return "The network rate-limited the request. Wait a moment and send again.";
  }
  if (/failed to fetch|networkerror|econnrefused|did not answer in time/i.test(raw)) {
    return "The endpoint could not be reached. Check the RPC recorded for this network and try again.";
  }
  return raw.length > 400 ? raw.slice(0, 400) + "…" : raw;
}

export async function writeAndWait(
  account: Address,
  provider: unknown,
  address: Address,
  functionName: string,
  args: CalldataEncodable[] = [],
  onStage?: (stage: TxStage, hash: string) => void,
  value: bigint = BigInt(0),
): Promise<WriteResult> {
  const client = getWriteClient(account, provider as EthereumProvider);
  // The network enforces a fee system: a transaction must carry a fee deposit.
  const estimate = await client.estimateTransactionFees({});
  const fees = {
    distribution: estimate.distribution,
    feeValue: estimate.feeValue,
    ...(estimate.messageAllocations ? { messageAllocations: estimate.messageAllocations } : {}),
  };
  let hash: TransactionHash;
  try {
    hash = await client.writeContract({ address, functionName, args, value, fees });
  } catch (error) {
    // The counter is read from a view of the account that can lag the sender. One retry after a
    // short pause lets the read catch up instead of failing the whole attempt.
    if (!NONCE_TOO_LOW.test(error instanceof Error ? error.message : String(error))) throw error;
    await sleep(2000);
    hash = await client.writeContract({ address, functionName, args, value, fees });
  }

  const hashText = String(hash);
  await client.waitForTransactionReceipt({
    hash,
    waitUntil: "decided",
    retries: 200,
    interval: 3000,
  });
  onStage?.("accepted", hashText);

  // Finalization is a separate, slower guarantee. The console keeps showing "accepted"
  // until it lands and reports it when it does, rather than assuming it.
  void waitForFinalized(hashText).then((ok) => {
    if (ok) onStage?.("finalized", hashText);
  });

  return { hash: hashText, finalized: false };
}

/** Poll until the chain reports FINALIZED. Returns false on timeout. */
export async function waitForFinalized(hash: string, attempts = 80): Promise<boolean> {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const tx = await rpcOnce<{ status?: string }>("eth_getTransactionByHash", [hash]);
      if (String(tx?.status || "").toUpperCase() === "FINALIZED") return true;
    } catch {
      // transient network failure: keep polling
    }
    await sleep(4000);
  }
  return false;
}

export async function getTxStatus(hash: string): Promise<string> {
  const tx = await rpc<{ status?: string }>("eth_getTransactionByHash", [hash]);
  return String(tx?.status || "unknown").toUpperCase();
}

/** Studio faucet: tops the connected wallet up with test value for fees. */
export async function fundWithTestGen(address: Address, units = 100): Promise<void> {
  await rpc("sim_fundAccount", [address, units * 1e18]);
}

export async function getNativeBalance(address: Address): Promise<string> {
  const wei = BigInt(await rpc<string>("eth_getBalance", [address, "latest"]));
  return (wei / BigInt(10) ** BigInt(18)).toString();
}

export const STATUS_LABEL: Record<string, string> = {
  [TransactionStatus.PENDING]: "pending",
  [TransactionStatus.ACCEPTED]: "accepted",
  [TransactionStatus.FINALIZED]: "finalized",
  [TransactionStatus.UNDETERMINED]: "undetermined",
  [TransactionStatus.CANCELED]: "canceled",
};
