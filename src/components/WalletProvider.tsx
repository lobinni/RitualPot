"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fundWithTestGen, getNativeBalance, getWalletChainId, type Address } from "@/lib/chain";
import {
  CHAIN_ID,
  EXPLORER_BASE,
  NATIVE_SYMBOL,
  NETWORK_ID as NETWORK_LABEL,
  RPC_URL,
} from "@/lib/config";

type Eip1193 = {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

export type Wallet = {
  account: Address | null;
  provider: Eip1193 | null;
  available: boolean;
  connecting: boolean;
  balance: string | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  refreshBalance: () => Promise<void>;
  /** The chain the wallet reports, and whether it matches the configured network. */
  walletChainId: number | null;
  chainMismatch: boolean;
  refreshChain: () => Promise<void>;
  /** Move the wallet to the configured network. Returns null on success, a reason otherwise. */
  switchChain: () => Promise<string | null>;
  fund: () => Promise<string | null>;
};

const WalletContext = createContext<Wallet | null>(null);

const ACCOUNT_KEY = "ritualpot.account";

/**
 * Find the injected wallet. Several extensions can share `window.ethereum`, so the MetaMask
 * entry is preferred when the browser exposes a list; a wallet that injects after page load is
 * picked up by the second attempt in the effect below.
 */
function detectProvider(): Eip1193 | null {
  if (typeof window === "undefined") return null;
  const injected = (
    window as unknown as {
      ethereum?: Eip1193 & {
        providers?: (Eip1193 & { isMetaMask?: boolean })[];
        isMetaMask?: boolean;
      };
    }
  ).ethereum;
  if (!injected) return null;
  if (Array.isArray(injected.providers) && injected.providers.length > 0) {
    return injected.providers.find((entry) => entry.isMetaMask) ?? injected.providers[0];
  }
  return injected;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Address | null>(null);
  const [provider, setProvider] = useState<Eip1193 | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);

  const [injectedProvider, setInjectedProvider] = useState<Eip1193 | null>(null);

  const available = injectedProvider !== null;

  // The wallet can inject itself after the first paint; look for it now and once more shortly.
  useEffect(() => {
    const found = detectProvider();
    if (found) {
      setInjectedProvider(found);
      return;
    }
    const timer = window.setTimeout(() => setInjectedProvider(detectProvider()), 1500);
    return () => window.clearTimeout(timer);
  }, []);

  /** Re-read the chain the wallet is on. Called on connect, on wallet events, and on demand. */
  const refreshChain = useCallback(async () => {
    const active = provider ?? injectedProvider ?? detectProvider();
    if (!active) {
      setWalletChainId(null);
      return;
    }
    if (active !== injectedProvider) setInjectedProvider(active);
    setWalletChainId(await getWalletChainId(active));
  }, [provider, injectedProvider]);

  /**
   * Ask the wallet to move to the configured network, adding it first when the wallet has never
   * heard of it. A MetaMask entry with the wrong chain id cannot be fixed from this page, so the
   * button installs the correct definition instead.
   */
  const switchChain = useCallback(async (): Promise<string | null> => {
    const active = provider ?? injectedProvider ?? detectProvider();
    if (!active?.request) return "No wallet was found in this browser.";
    const chainIdHex = "0x" + CHAIN_ID.toString(16);

    try {
      await active.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chainIdHex }],
      });
    } catch (switchError) {
      const code = (switchError as { code?: number })?.code;
      const unknownChain = code === 4902 || code === -32603 || code === -32601;
      if (!unknownChain) {
        return switchError instanceof Error
          ? switchError.message
          : "The wallet refused to switch network.";
      }
      try {
        await active.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: chainIdHex,
              chainName: NETWORK_LABEL,
              nativeCurrency: { name: NATIVE_SYMBOL, symbol: NATIVE_SYMBOL, decimals: 18 },
              rpcUrls: [RPC_URL],
              blockExplorerUrls: [EXPLORER_BASE],
            },
          ],
        });
      } catch (addError) {
        return addError instanceof Error
          ? addError.message
          : "The wallet refused to add the network.";
      }
    }

    await refreshChain();
    return null;
  }, [provider, injectedProvider, refreshChain]);

  const refreshBalance = useCallback(async () => {
    if (!account) {
      setBalance(null);
      return;
    }
    try {
      setBalance(await getNativeBalance(account));
    } catch {
      setBalance(null);
    }
  }, [account]);

  const connect = useCallback(async () => {
    const injected = injectedProvider ?? detectProvider();
    if (!injected) {
      setInjectedProvider(detectProvider());
      setError("No wallet was found in this browser. Install one, then reconnect.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const accounts = (await injected.request({ method: "eth_requestAccounts" })) as string[];
      const first = accounts?.[0];
      if (!first) throw new Error("The wallet returned no account.");
      setProvider(injected);
      setAccount(first as Address);
      setWalletChainId(await getWalletChainId(injected));
      window.localStorage.setItem(ACCOUNT_KEY, first);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "The wallet refused the connection.");
    } finally {
      setConnecting(false);
    }
  }, [injectedProvider]);

  const disconnect = useCallback(() => {
    setAccount(null);
    setProvider(null);
    setBalance(null);
    setWalletChainId(null);
    setError(null);
    window.localStorage.removeItem(ACCOUNT_KEY);
  }, []);

  const fund = useCallback(async (): Promise<string | null> => {
    if (!account) return null;
    try {
      await fundWithTestGen(account, 100);
      await refreshBalance();
      return null;
    } catch (exc) {
      return exc instanceof Error ? exc.message : "The faucet could not be reached.";
    }
  }, [account, refreshBalance]);

  // Re-attach silently when the browser still holds a previous session.
  useEffect(() => {
    const injected = detectProvider();
    if (injected) setInjectedProvider(injected);
    if (!injected) return;
    const stored = window.localStorage.getItem(ACCOUNT_KEY);
    if (!stored) return;
    injected
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        const list = accounts as string[];
        if (list?.includes(stored)) {
          setProvider(injected);
          setAccount(stored as Address);
          void getWalletChainId(injected).then(setWalletChainId);
        } else {
          window.localStorage.removeItem(ACCOUNT_KEY);
        }
      })
      .catch(() => undefined);
  }, []);

  // Switching the network in the wallet must reach the console: MetaMask announces it on
  // `chainChanged`, and a changed account arrives the same way.
  useEffect(() => {
    const active = provider ?? injectedProvider;
    if (!active?.on) return;

    const onChainChanged = (...args: unknown[]) => {
      const raw = args[0];
      try {
        setWalletChainId(Number(BigInt(String(raw))));
      } catch {
        setWalletChainId(null);
      }
    };
    const onAccountsChanged = (...args: unknown[]) => {
      const list = (args[0] as string[]) ?? [];
      if (list.length > 0) {
        setAccount(list[0] as Address);
        window.localStorage.setItem(ACCOUNT_KEY, list[0]);
        void refreshBalance();
      } else {
        disconnect();
      }
    };

    active.on("chainChanged", onChainChanged);
    active.on("accountsChanged", onAccountsChanged);
    return () => {
      active.removeListener?.("chainChanged", onChainChanged);
      active.removeListener?.("accountsChanged", onAccountsChanged);
    };
  }, [provider, injectedProvider, refreshBalance, disconnect]);

  // A network switch made while the tab was in the background can miss its event: re-read the
  // chain whenever the page is focused again, and once when an account appears.
  useEffect(() => {
    if (!account) return;
    const onFocus = () => void refreshChain();
    window.addEventListener("focus", onFocus);
    void refreshChain();
    return () => window.removeEventListener("focus", onFocus);
  }, [account, refreshChain]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  const chainMismatch = walletChainId !== null && walletChainId !== CHAIN_ID;

  const value = useMemo<Wallet>(
    () => ({
      account,
      provider,
      available,
      connecting,
      balance,
      error,
      connect,
      disconnect,
      refreshBalance,
      fund,
      walletChainId,
      chainMismatch,
      refreshChain,
      switchChain,
    }),
    [
      account,
      provider,
      available,
      connecting,
      balance,
      error,
      connect,
      disconnect,
      refreshBalance,
      fund,
      walletChainId,
      chainMismatch,
      refreshChain,
      switchChain,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): Wallet {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used inside WalletProvider");
  return context;
}
