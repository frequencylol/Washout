import { Connection, clusterApiUrl } from "@solana/web3.js";

export type Network = "mainnet-beta" | "devnet";

const KEY = "memelaunch.network";

export function getNetwork(): Network {
  if (typeof window === "undefined") return "mainnet-beta";
  return (localStorage.getItem(KEY) as Network) || "mainnet-beta";
}

export function setNetwork(n: Network) {
  localStorage.setItem(KEY, n);
}

// Public RPCs are heavily rate-limited. Users can override.
const RPC_OVERRIDE_KEY = "memelaunch.rpc";
export function getRpcOverride(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(RPC_OVERRIDE_KEY);
}
export function setRpcOverride(url: string | null) {
  if (url) localStorage.setItem(RPC_OVERRIDE_KEY, url);
  else localStorage.removeItem(RPC_OVERRIDE_KEY);
}

export function getConnection(network: Network = getNetwork()): Connection {
  const override = getRpcOverride();
  // Use more reliable public RPCs as fallback
  // Note: api.mainnet-beta.solana.com is heavily rate-limited/blocked from browsers
  const defaultRpc = network === "mainnet-beta" 
    ? "https://mainnet.helius-rpc.com/?api-key=1d8740dc-e5f4-421c-b823-e1bad1889eff"
    : "https://api.devnet.solana.com";
  const url = override || defaultRpc;
  return new Connection(url, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 60000,
  });
}
