import registryJson from "../../deployments/registry.json";

/**
 * Where the contract lives, and how that is decided.
 *
 * The address is never hardcoded in a component. Three sources, first hit wins:
 *   1. NEXT_PUBLIC_RITUALPOT_ADDRESS  - pins one build (previews, a fork)
 *   2. the database record            - moves a running instance without a rebuild
 *   3. deployments/registry.json      - the checked-in default for the selected network
 */

export type NetworkEntry = {
  id: string;
  label: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  nativeSymbol: string;
  address: string | null;
  deployedAt: string | null;
  deployedBy: string | null;
  codeSha256: string | null;
  status: string;
};

export type RegistryFile = {
  contractSource: string;
  defaultNetwork: string;
  networks: NetworkEntry[];
};

export const registry = registryJson as unknown as RegistryFile;

export const NETWORK_ID =
  process.env.NEXT_PUBLIC_RITUALPOT_NETWORK || registry.defaultNetwork;

export const NETWORK: NetworkEntry =
  registry.networks.find((entry) => entry.id === NETWORK_ID) ?? registry.networks[0];

export const CHAIN_ID = NETWORK.chainId;
export const NATIVE_SYMBOL = NETWORK.nativeSymbol;
export const CONTRACT_SOURCE = registry.contractSource;

export const RPC_URL = (
  process.env.NEXT_PUBLIC_RITUALPOT_RPC || NETWORK.rpcUrl
).replace(/\/$/, "");

export const EXPLORER_BASE = (
  process.env.NEXT_PUBLIC_RITUALPOT_EXPLORER || NETWORK.explorerUrl
).replace(/\/$/, "");

export const ENV_ADDRESS = process.env.NEXT_PUBLIC_RITUALPOT_ADDRESS || null;

export const isAddress = (value: unknown): value is `0x${string}` =>
  typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);

export type AddressSource = "environment" | "database" | "registry" | "none";

export type ResolvedDeployment = {
  address: `0x${string}` | null;
  source: AddressSource;
  network: string;
  label: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  nativeSymbol: string;
  contractSource: string;
  status: string;
};

/** The same order the console and the API route use, so the two can never disagree. */
export function resolveDeployment(databaseAddress: string | null): ResolvedDeployment {
  const base = {
    network: NETWORK.id,
    label: NETWORK.label,
    chainId: CHAIN_ID,
    rpcUrl: RPC_URL,
    explorerUrl: EXPLORER_BASE,
    nativeSymbol: NATIVE_SYMBOL,
    contractSource: CONTRACT_SOURCE,
    status: NETWORK.status,
  };

  if (isAddress(ENV_ADDRESS)) {
    return { ...base, address: ENV_ADDRESS, source: "environment" };
  }
  if (isAddress(databaseAddress)) {
    return { ...base, address: databaseAddress, source: "database" };
  }
  if (isAddress(NETWORK.address)) {
    return { ...base, address: NETWORK.address as `0x${string}`, source: "registry" };
  }
  return { ...base, address: null, source: "none" };
}

/** Build-time fallback used before the deployment record has been fetched. */
export const buildTimeDeployment = (): ResolvedDeployment => resolveDeployment(null);

export const txUrl = (hash: string) => `${EXPLORER_BASE}/tx/${hash}`;
export const addressUrl = (address: string) => `${EXPLORER_BASE}/address/${address}`;

export const shortAddress = (address: string, size = 4) =>
  address.length > size * 2 + 2
    ? `${address.slice(0, size + 2)}…${address.slice(-size)}`
    : address;
