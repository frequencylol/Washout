import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { getConnection } from "./solana-network";
import { loadSubwallets, toKeypair, type StoredWallet } from "./subwallets";
import { getPhantom } from "./phantom";
import { uploadMetadataServer, type IpfsResponse } from "./server-functions";

const PUMPPORTAL_TRADE_LOCAL = "https://pumpportal.fun/api/trade-local";

export interface CoinMetadataInput {
  name: string;
  symbol: string;
  description: string;
  image: File;
  twitter?: string;
  telegram?: string;
  website?: string;
}

export type { IpfsResponse } from "./server-functions";

export async function uploadMetadata(input: CoinMetadataInput): Promise<IpfsResponse> {
  const fd = new FormData();
  fd.append("file", input.image);
  fd.append("name", input.name);
  fd.append("symbol", input.symbol);
  fd.append("description", input.description);
  fd.append("twitter", input.twitter || "");
  fd.append("telegram", input.telegram || "");
  fd.append("website", input.website || "");
  fd.append("showName", "true");
  // Use server function to avoid CORS issues
  return uploadMetadataServer({ data: fd });
}

async function getTradeTx(body: Record<string, unknown>): Promise<VersionedTransaction> {
  const r = await fetch(PUMPPORTAL_TRADE_LOCAL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PumpPortal error ${r.status}: ${await r.text()}`);
  const data = new Uint8Array(await r.arrayBuffer());
  return VersionedTransaction.deserialize(data);
}

/**
 * Create a new memecoin via Pump.fun (mainnet only).
 * The connected Phantom wallet pays + becomes creator.
 * `devBuySol` is the creator's first buy in SOL (can be 0).
 */
export async function createCoin(args: {
  metadata: IpfsResponse;
  devBuySol: number;
  slippageBps?: number;
  priorityFeeSol?: number;
}): Promise<{ signature: string; mint: string }> {
  const phantom = getPhantom();
  if (!phantom?.publicKey) throw new Error("Phantom not connected");
  const mintKp = Keypair.generate();

  const tx = await getTradeTx({
    publicKey: phantom.publicKey.toBase58(),
    action: "create",
    tokenMetadata: {
      name: args.metadata.metadata.name,
      symbol: args.metadata.metadata.symbol,
      uri: args.metadata.metadataUri,
    },
    mint: bs58.encode(mintKp.secretKey),
    denominatedInSol: "true",
    amount: args.devBuySol,
    slippage: Math.round((args.slippageBps ?? 1000) / 100),
    priorityFee: args.priorityFeeSol ?? 0.0005,
    pool: "pump",
  });

  tx.sign([mintKp]);
  const signed = await phantom.signTransaction(tx);
  const conn = getConnection();
  const sig = await conn.sendRawTransaction(signed.serialize(), { skipPreflight: false });
  await conn.confirmTransaction(sig, "confirmed");
  return { signature: sig, mint: mintKp.publicKey.toBase58() };
}

/** Buy from a sub-wallet (signed locally). */
export async function buyFromWallet(
  conn: Connection,
  wallet: StoredWallet,
  mint: string,
  amountSol: number,
  slippageBps = 1500,
  priorityFeeSol = 0.0003
): Promise<string> {
  const kp = toKeypair(wallet);
  const tx = await getTradeTx({
    publicKey: kp.publicKey.toBase58(),
    action: "buy",
    mint,
    denominatedInSol: "true",
    amount: amountSol,
    slippage: Math.round(slippageBps / 100),
    priorityFee: priorityFeeSol,
    pool: "pump",
  });
  tx.sign([kp]);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  return sig;
}

/** Sell 100% of token balance from a wallet. */
export async function sellAllFromWallet(
  conn: Connection,
  wallet: StoredWallet,
  mint: string,
  slippageBps = 2500,
  priorityFeeSol = 0.001
): Promise<string> {
  const kp = toKeypair(wallet);
  const tx = await getTradeTx({
    publicKey: kp.publicKey.toBase58(),
    action: "sell",
    mint,
    denominatedInSol: "false",
    amount: "100%",
    slippage: Math.round(slippageBps / 100),
    priorityFee: priorityFeeSol,
    pool: "pump",
  });
  tx.sign([kp]);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  return sig;
}

/** Distribute SOL from connected Phantom to sub-wallets in a single tx. */
export async function fundSubwallets(
  recipients: { pubkey: string; lamports: number }[]
): Promise<string> {
  const phantom = getPhantom();
  if (!phantom?.publicKey) throw new Error("Phantom not connected");
  const conn = getConnection();
  const tx = new Transaction();
  for (const r of recipients) {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: phantom.publicKey,
        toPubkey: new PublicKey(r.pubkey),
        lamports: r.lamports,
      })
    );
  }
  const { blockhash } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = phantom.publicKey;
  const { signature } = await phantom.signAndSendTransaction(tx);
  await conn.confirmTransaction(signature, "confirmed");
  return signature;
}

/**
 * Bundle buy: fund N sub-wallets with TOTAL sol, then stagger buys over `durationMs`.
 * Returns per-wallet signatures (or errors).
 */
export async function bundleBuy(args: {
  mint: string;
  wallets: StoredWallet[];
  totalSol: number; // total budget used for buys (e.g. 1.5)
  durationMs: number; // 60_000 - 120_000
  onLog?: (msg: string) => void;
}): Promise<{ pubkey: string; signature?: string; error?: string }[]> {
  const { mint, wallets, totalSol, durationMs, onLog } = args;
  const log = onLog || (() => {});
  const conn = getConnection();

  // Reserve ~0.005 SOL per wallet for tx fees + rent.
  const feeReserve = 0.005;
  const buyPerWallet = totalSol / wallets.length;
  const fundPerWallet = buyPerWallet + feeReserve;

  log(`Funding ${wallets.length} wallets with ${fundPerWallet.toFixed(4)} SOL each...`);
  await fundSubwallets(
    wallets.map((w) => ({
      pubkey: w.publicKey,
      lamports: Math.floor(fundPerWallet * LAMPORTS_PER_SOL),
    }))
  );
  log(`Funded. Staggering buys over ${Math.round(durationMs / 1000)}s...`);

  const results: { pubkey: string; signature?: string; error?: string }[] = [];
  const step = durationMs / wallets.length;

  await Promise.all(
    wallets.map(
      (w, i) =>
        new Promise<void>((resolve) => {
          // Jitter slightly so buys aren't perfectly regular
          const delay = i * step + Math.random() * step * 0.4;
          setTimeout(async () => {
            try {
              const sig = await buyFromWallet(conn, w, mint, buyPerWallet);
              log(`Buy ${i + 1}/${wallets.length} ✓ ${sig.slice(0, 8)}…`);
              results.push({ pubkey: w.publicKey, signature: sig });
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              log(`Buy ${i + 1}/${wallets.length} ✗ ${msg.slice(0, 80)}`);
              results.push({ pubkey: w.publicKey, error: msg });
            }
            resolve();
          }, delay);
        })
    )
  );
  return results;
}

/** Panic: every wallet sells 100% in parallel. */
export async function panicSell(
  mint: string,
  wallets?: StoredWallet[],
  onLog?: (msg: string) => void
): Promise<{ pubkey: string; signature?: string; error?: string }[]> {
  const list = wallets || loadSubwallets();
  const log = onLog || (() => {});
  const conn = getConnection();
  log(`PANIC: dumping from ${list.length} wallets...`);
  const results = await Promise.all(
    list.map(async (w) => {
      try {
        const sig = await sellAllFromWallet(conn, w, mint);
        log(`Dump ✓ ${w.publicKey.slice(0, 6)}… ${sig.slice(0, 8)}…`);
        return { pubkey: w.publicKey, signature: sig };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log(`Dump ✗ ${w.publicKey.slice(0, 6)}…: ${msg.slice(0, 80)}`);
        return { pubkey: w.publicKey, error: msg };
      }
    })
  );
  return results;
}

/** Reclaim leftover SOL from sub-wallets back to a destination. */
export async function reclaimSol(
  destination: string,
  wallets?: StoredWallet[]
): Promise<string[]> {
  const list = wallets || loadSubwallets();
  const conn = getConnection();
  const dest = new PublicKey(destination);
  const sigs: string[] = [];
  for (const w of list) {
    try {
      const kp = toKeypair(w);
      const bal = await conn.getBalance(kp.publicKey);
      const keep = 5000; // for fee
      if (bal <= keep) continue;
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: kp.publicKey,
          toPubkey: dest,
          lamports: bal - keep,
        })
      );
      const { blockhash } = await conn.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = kp.publicKey;
      tx.sign(kp);
      const sig = await conn.sendRawTransaction(tx.serialize());
      sigs.push(sig);
    } catch {
      /* ignore */
    }
  }
  return sigs;
}
