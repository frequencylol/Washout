import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const KEY = "memelaunch.subwallets";

export interface StoredWallet {
  publicKey: string;
  secretKey: string; // base58
}

export function loadSubwallets(): StoredWallet[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveSubwallets(wallets: StoredWallet[]) {
  localStorage.setItem(KEY, JSON.stringify(wallets));
}

export function clearSubwallets() {
  localStorage.removeItem(KEY);
}

export function generateSubwallets(count: number): StoredWallet[] {
  const wallets: StoredWallet[] = [];
  for (let i = 0; i < count; i++) {
    const kp = Keypair.generate();
    wallets.push({
      publicKey: kp.publicKey.toBase58(),
      secretKey: bs58.encode(kp.secretKey),
    });
  }
  saveSubwallets(wallets);
  return wallets;
}

export function toKeypair(w: StoredWallet): Keypair {
  return Keypair.fromSecretKey(bs58.decode(w.secretKey));
}
