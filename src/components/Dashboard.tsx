"use client";

import { useEffect, useState } from "react";
import { Buffer } from "buffer";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { toast } from "sonner";
import {
  AlertTriangle,
  Flame,
  Loader2,
  Rocket,
  Wallet,
  Zap,
  Settings,
  Activity,
  ChevronDown,
  ExternalLink,
  Copy,
  Check,
  Image as ImageIcon,
  Globe,
  Twitter,
  Send,
  RefreshCw,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import { getPhantom } from "@/lib/phantom";
import {
  getNetwork,
  setNetwork as persistNetwork,
  getRpcOverride,
  setRpcOverride,
  getConnection,
  type Network,
} from "@/lib/solana-network";
import {
  loadSubwallets,
  generateSubwallets,
  clearSubwallets,
  type StoredWallet,
} from "@/lib/subwallets";
import {
  uploadMetadata,
  createCoin,
  bundleBuy,
  panicSell,
  reclaimSol,
} from "@/lib/pumpportal";

// Polyfill Buffer for @solana/web3.js in browser
if (typeof window !== "undefined") {
  (window as unknown as { Buffer: typeof Buffer }).Buffer ??= Buffer;
}

export default function Dashboard() {
  const [mounted, setMounted] = useState(false);
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [network, setNetworkState] = useState<Network>("mainnet-beta");
  const [rpc, setRpc] = useState<string>("");
  const [balance, setBalance] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  // Coin form
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [website, setWebsite] = useState("");
  const [devBuy, setDevBuy] = useState("0");

  // Bundle
  const [bundleEnabled, setBundleEnabled] = useState(false);
  const [bundleSol, setBundleSol] = useState(1.5);
  const [walletCount, setWalletCount] = useState(15);
  const [durationSec, setDurationSec] = useState(90);

  // State
  const [subwallets, setSubwalletsState] = useState<StoredWallet[]>([]);
  const [mint, setMint] = useState<string>("");
  const [logs, setLogs] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [walletsOpen, setWalletsOpen] = useState(false);

  const log = (m: string) => {
    console.log("[launcher]", m);
    setLogs((l) => [`${new Date().toLocaleTimeString()}  ${m}`, ...l].slice(0, 200));
  };

  useEffect(() => {
    setMounted(true);
    setNetworkState(getNetwork());
    setRpc(getRpcOverride() || "");
    setSubwalletsState(loadSubwallets());
    const stored = localStorage.getItem("memelaunch.lastMint");
    if (stored) setMint(stored);

    const phantom = getPhantom();
    if (phantom) {
      phantom.connect({ onlyIfTrusted: true }).then(
        (r) => setPubkey(r.publicKey.toBase58()),
        () => {}
      );
    }
  }, []);

  useEffect(() => {
    if (!pubkey) {
      setBalance(null);
      return;
    }
    (async () => {
      try {
        const conn = getConnection(network);
        const { PublicKey } = await import("@solana/web3.js");
        const b = await conn.getBalance(new PublicKey(pubkey));
        setBalance(b / LAMPORTS_PER_SOL);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [pubkey, network, rpc]);

  const connect = async () => {
    const phantom = getPhantom();
    if (!phantom) {
      toast.error("Phantom wallet not found", {
        description: "Install Phantom from phantom.app",
      });
      return;
    }
    try {
      const r = await phantom.connect();
      setPubkey(r.publicKey.toBase58());
      toast.success("Wallet connected");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Connect failed");
    }
  };

  const disconnect = async () => {
    const phantom = getPhantom();
    if (phantom) await phantom.disconnect();
    setPubkey(null);
  };

  const onNetworkChange = (mainnet: boolean) => {
    const n: Network = mainnet ? "mainnet-beta" : "devnet";
    setNetworkState(n);
    persistNetwork(n);
  };

  const onRpcSave = () => {
    setRpcOverride(rpc.trim() || null);
    toast.success("RPC endpoint saved");
  };

  const onImage = (f: File | null) => {
    setImage(f);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(f ? URL.createObjectURL(f) : null);
  };

  const onGenerateWallets = () => {
    const w = generateSubwallets(walletCount);
    setSubwalletsState(w);
    log(`Generated ${w.length} sub-wallets (keys in localStorage)`);
    toast.success(`Generated ${w.length} sub-wallets`);
  };

  const onClearWallets = () => {
    if (!confirm("Clear all sub-wallet private keys? Any SOL left in them will be unrecoverable.")) return;
    clearSubwallets();
    setSubwalletsState([]);
    log("Cleared sub-wallets.");
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const onLaunch = async () => {
    if (!pubkey) return toast.error("Connect Phantom first");
    if (network !== "mainnet-beta")
      return toast.error("Pump.fun is mainnet-only. Switch to mainnet to launch.");
    if (!name || !symbol || !description || !image)
      return toast.error("Fill name, symbol, description, image");
    if (bundleEnabled && subwallets.length < 10)
      return toast.error("Generate at least 10 sub-wallets for bundle mode");

    setWorking(true);
    try {
      log("Uploading metadata to IPFS...");
      const meta = await uploadMetadata({
        name,
        symbol,
        description,
        image,
        twitter,
        telegram,
        website,
      });
      log(`Metadata URI: ${meta.metadataUri}`);

      log("Creating token on Pump.fun...");
      const { signature, mint: newMint } = await createCoin({
        metadata: meta,
        devBuySol: parseFloat(devBuy) || 0,
      });
      setMint(newMint);
      localStorage.setItem("memelaunch.lastMint", newMint);
      log(`Launched! Mint: ${newMint}`);
      log(`Tx: ${signature}`);
      toast.success("Token launched!", { description: newMint });

      if (bundleEnabled) {
        log(`Starting bundle: ${bundleSol} SOL across ${subwallets.length} wallets over ${durationSec}s`);
        await bundleBuy({
          mint: newMint,
          wallets: subwallets,
          totalSol: bundleSol,
          durationMs: durationSec * 1000,
          onLog: log,
        });
        log("Bundle complete.");
        toast.success("Bundle buys complete");
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      log(`Error: ${m}`);
      toast.error("Launch failed", { description: m });
    } finally {
      setWorking(false);
    }
  };

  const onPanic = async () => {
    if (!mint) return toast.error("No mint set");
    if (subwallets.length === 0) return toast.error("No sub-wallets");
    if (!confirm(`PANIC SELL: Dump all ${subwallets.length} wallets NOW?`)) return;
    setWorking(true);
    try {
      await panicSell(mint, subwallets, log);
      toast.success("Panic sell dispatched");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Panic failed");
    } finally {
      setWorking(false);
    }
  };

  const onReclaim = async () => {
    if (!pubkey) return toast.error("Connect Phantom");
    setWorking(true);
    try {
      const sigs = await reclaimSol(pubkey, subwallets);
      log(`Reclaimed SOL from ${sigs.length} wallets`);
      toast.success(`Swept ${sigs.length} wallets`);
    } finally {
      setWorking(false);
    }
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Subtle background patterns */}
      <div 
        className="fixed inset-0 opacity-[0.02] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 50% 0%, oklch(0.75 0.18 145 / 0.3) 0%, transparent 50%)`,
        }}
      />
      <div 
        className="fixed inset-0 opacity-[0.015] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)`,
          backgroundSize: '80px 80px'
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            {/* Washout Logo */}
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
              <svg viewBox="0 0 24 24" className="h-7 w-7 text-primary" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Washout
              </h1>
              <p className="text-sm text-muted-foreground">
                Solana Token Launchpad
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Network Toggle */}
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
              <div className={`h-2 w-2 rounded-full ${network === "mainnet-beta" ? "bg-primary" : "bg-amber-500"}`} />
              <span className="text-xs font-medium text-muted-foreground">
                {network === "mainnet-beta" ? "Mainnet" : "Devnet"}
              </span>
              <Switch
                checked={network === "mainnet-beta"}
                onCheckedChange={onNetworkChange}
                className="data-[state=checked]:bg-primary"
              />
            </div>

            {/* Wallet */}
            {pubkey ? (
              <Button 
                variant="outline" 
                onClick={disconnect} 
                className="border-border bg-card hover:bg-accent"
              >
                <Wallet className="mr-2 h-4 w-4 text-primary" />
                <span className="font-mono text-xs">{pubkey.slice(0, 4)}...{pubkey.slice(-4)}</span>
                {balance != null && (
                  <Badge variant="secondary" className="ml-2 bg-primary/10 text-primary">
                    {balance.toFixed(2)} SOL
                  </Badge>
                )}
              </Button>
            ) : (
              <Button onClick={connect} className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Wallet className="mr-2 h-4 w-4" />
                Connect Wallet
              </Button>
            )}
          </div>
        </header>

        {/* Warning Banner */}
        <div className="mb-8 flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div className="text-sm">
            <p className="font-medium text-amber-500">Important Notice</p>
            <p className="mt-1 text-amber-500/80">
              Private keys are stored in localStorage. Pump.fun ToS prohibits volume-bundling. Use at your own risk.
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-12">
          {/* LEFT COLUMN: Token Configuration */}
          <div className="space-y-6 lg:col-span-7">
            {/* Token Details Card */}
            <Card className="border-border bg-card/50 backdrop-blur-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Token Configuration</CardTitle>
                </div>
                <CardDescription>
                  Configure your memecoin&apos;s metadata and branding
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Image and Basic Info */}
                <div className="grid gap-6 sm:grid-cols-[140px_1fr]">
                  <div>
                    <Label className="mb-2 block text-xs text-muted-foreground">Token Image</Label>
                    <label className="group flex aspect-square cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-muted/30 transition-all hover:border-primary/50 hover:bg-muted/50">
                      {imagePreview ? (
                        <img src={imagePreview} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <>
                          <ImageIcon className="mb-2 h-8 w-8 text-muted-foreground/50 transition-colors group-hover:text-primary/50" />
                          <span className="text-xs text-muted-foreground">Upload</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => onImage(e.target.files?.[0] || null)}
                      />
                    </label>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="name" className="text-xs text-muted-foreground">Name</Label>
                        <Input 
                          id="name" 
                          value={name} 
                          onChange={(e) => setName(e.target.value)} 
                          placeholder="Doge Killer"
                          className="mt-1.5 bg-muted/30 border-border focus:border-primary"
                        />
                      </div>
                      <div>
                        <Label htmlFor="symbol" className="text-xs text-muted-foreground">Symbol</Label>
                        <Input 
                          id="symbol" 
                          value={symbol} 
                          onChange={(e) => setSymbol(e.target.value.toUpperCase())} 
                          placeholder="DOGEK" 
                          maxLength={10}
                          className="mt-1.5 bg-muted/30 border-border focus:border-primary font-mono"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="desc" className="text-xs text-muted-foreground">Description</Label>
                      <Textarea 
                        id="desc" 
                        value={description} 
                        onChange={(e) => setDescription(e.target.value)} 
                        rows={3} 
                        placeholder="The next 100x moon mission..."
                        className="mt-1.5 bg-muted/30 border-border focus:border-primary resize-none"
                      />
                    </div>
                  </div>
                </div>

                <Separator className="bg-border/50" />

                {/* Social Links */}
                <div>
                  <Label className="mb-3 block text-xs text-muted-foreground">Social Links (Optional)</Label>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="relative">
                      <Twitter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input 
                        value={twitter} 
                        onChange={(e) => setTwitter(e.target.value)} 
                        placeholder="x.com/..."
                        className="bg-muted/30 border-border pl-10"
                      />
                    </div>
                    <div className="relative">
                      <Send className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input 
                        value={telegram} 
                        onChange={(e) => setTelegram(e.target.value)} 
                        placeholder="t.me/..."
                        className="bg-muted/30 border-border pl-10"
                      />
                    </div>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input 
                        value={website} 
                        onChange={(e) => setWebsite(e.target.value)} 
                        placeholder="website.com"
                        className="bg-muted/30 border-border pl-10"
                      />
                    </div>
                  </div>
                </div>

                <Separator className="bg-border/50" />

                {/* Dev Buy */}
                <div>
                  <Label htmlFor="devbuy" className="text-xs text-muted-foreground">
                    Initial Dev Buy (SOL)
                  </Label>
                  <p className="mb-2 text-xs text-muted-foreground/70">
                    Your initial purchase from the connected wallet
                  </p>
                  <Input 
                    id="devbuy" 
                    type="number" 
                    step="0.01" 
                    min="0" 
                    value={devBuy} 
                    onChange={(e) => setDevBuy(e.target.value)}
                    className="max-w-[200px] bg-muted/30 border-border font-mono"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Active Mint & Logs */}
            <Card className="border-border bg-card/50 backdrop-blur-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Active Token</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    value={mint}
                    onChange={(e) => {
                      setMint(e.target.value);
                      localStorage.setItem("memelaunch.lastMint", e.target.value);
                    }}
                    placeholder="Paste existing mint address or launch new"
                    className="bg-muted/30 border-border font-mono text-xs"
                  />
                  {mint && (
                    <>
                      <Button 
                        size="icon" 
                        variant="outline"
                        onClick={() => copyToClipboard(mint)}
                        className="shrink-0 border-border"
                      >
                        {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                      </Button>
                      <Button 
                        size="icon" 
                        variant="outline"
                        asChild
                        className="shrink-0 border-border"
                      >
                        <a href={`https://pump.fun/coin/${mint}`} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    </>
                  )}
                </div>

                {/* Activity Log */}
                <div>
                  <Label className="mb-2 block text-xs text-muted-foreground">Activity Log</Label>
                  <div className="h-48 overflow-y-auto rounded-lg border border-border bg-background/50 p-3 font-mono text-xs leading-relaxed">
                    {logs.length === 0 ? (
                      <p className="text-muted-foreground/50">No activity yet...</p>
                    ) : (
                      logs.map((l, i) => (
                        <div key={i} className="text-muted-foreground">{l}</div>
                      ))
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* RIGHT COLUMN: Bundle & Actions */}
          <div className="space-y-6 lg:col-span-5">
            {/* Bundle Configuration */}
            <Card className="border-border bg-card/50 backdrop-blur-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">Volume Bundle</CardTitle>
                  </div>
                  <Switch 
                    checked={bundleEnabled} 
                    onCheckedChange={setBundleEnabled}
                    className="data-[state=checked]:bg-primary"
                  />
                </div>
                <CardDescription>
                  Distribute buys across multiple wallets
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className={bundleEnabled ? "" : "opacity-50 pointer-events-none"}>
                  {/* Total Budget */}
                  <div className="mb-5">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Total Budget</span>
                      <Badge className="bg-primary/10 text-primary font-mono">
                        {bundleSol.toFixed(2)} SOL
                      </Badge>
                    </div>
                    <Slider 
                      value={[bundleSol]} 
                      min={0.1} 
                      max={5} 
                      step={0.1} 
                      onValueChange={(v) => setBundleSol(v[0])}
                      className="[&_[role=slider]]:bg-primary"
                    />
                  </div>

                  {/* Wallet Count */}
                  <div className="mb-5">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Wallet Count</span>
                      <Badge className="bg-primary/10 text-primary font-mono">{walletCount}</Badge>
                    </div>
                    <Slider 
                      value={[walletCount]} 
                      min={10} 
                      max={20} 
                      step={1} 
                      onValueChange={(v) => setWalletCount(v[0])}
                      className="[&_[role=slider]]:bg-primary"
                    />
                  </div>

                  {/* Duration */}
                  <div className="mb-5">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Duration</span>
                      <Badge className="bg-primary/10 text-primary font-mono">{durationSec}s</Badge>
                    </div>
                    <Slider 
                      value={[durationSec]} 
                      min={60} 
                      max={120} 
                      step={5} 
                      onValueChange={(v) => setDurationSec(v[0])}
                      className="[&_[role=slider]]:bg-primary"
                    />
                  </div>
                </div>

                <Separator className="bg-border/50" />

                {/* Sub-wallets Management */}
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {subwallets.length} wallets stored
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="flex-1 border-border bg-muted/30"
                      onClick={onGenerateWallets}
                    >
                      Generate {walletCount}
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="border-border bg-muted/30"
                      onClick={onClearWallets}
                      disabled={subwallets.length === 0}
                    >
                      Clear
                    </Button>
                  </div>
                </div>

                {/* Cost breakdown */}
                <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">
                    Per-wallet: <span className="font-mono text-foreground">{(bundleSol / walletCount).toFixed(4)} SOL</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Est. total: <span className="font-mono text-foreground">~{(bundleSol + 0.005 * walletCount).toFixed(3)} SOL</span>
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="space-y-3">
              <Button
                size="lg"
                disabled={working || !pubkey}
                onClick={onLaunch}
                className="h-14 w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-base"
              >
                {working ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <Rocket className="mr-2 h-5 w-5" />
                )}
                {bundleEnabled ? "Launch + Bundle" : "Launch Token"}
              </Button>

              <Button
                size="lg"
                variant="destructive"
                disabled={working || !mint || subwallets.length === 0}
                onClick={onPanic}
                className="h-14 w-full font-bold text-base"
              >
                <Flame className="mr-2 h-5 w-5" />
                PANIC SELL ALL
              </Button>
            </div>

            {/* Settings Collapsible */}
            <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-full justify-between border-border bg-card/50">
                  <span className="flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Advanced Settings
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${settingsOpen ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-3">
                <Card className="border-border bg-card/50">
                  <CardContent className="pt-4 space-y-4">
                    <div>
                      <Label htmlFor="rpc" className="text-xs text-muted-foreground">Custom RPC Endpoint</Label>
                      <p className="mb-2 text-xs text-muted-foreground/70">Recommended for bundle operations</p>
                      <div className="flex gap-2">
                        <Input 
                          id="rpc" 
                          value={rpc} 
                          onChange={(e) => setRpc(e.target.value)} 
                          placeholder="https://your-rpc..."
                          className="bg-muted/30 border-border text-xs font-mono"
                        />
                        <Button size="sm" variant="outline" onClick={onRpcSave} className="border-border">
                          Save
                        </Button>
                      </div>
                    </div>

                    <Separator className="bg-border/50" />

                    <Button 
                      variant="outline" 
                      className="w-full border-border"
                      onClick={onReclaim}
                      disabled={!pubkey || subwallets.length === 0}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Reclaim SOL from Sub-wallets
                    </Button>
                  </CardContent>
                </Card>
              </CollapsibleContent>
            </Collapsible>

            {/* Sub-wallets List */}
            {subwallets.length > 0 && (
              <Collapsible open={walletsOpen} onOpenChange={setWalletsOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="w-full justify-between border-border bg-card/50">
                    <span className="flex items-center gap-2">
                      <Wallet className="h-4 w-4" />
                      Sub-wallets ({subwallets.length})
                    </span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${walletsOpen ? "rotate-180" : ""}`} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3">
                  <Card className="border-border bg-card/50">
                    <CardContent className="pt-4">
                      <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-background/50">
                        <table className="w-full text-left text-xs">
                          <thead className="sticky top-0 bg-card text-muted-foreground">
                            <tr>
                              <th className="p-2">#</th>
                              <th className="p-2">Public Key</th>
                            </tr>
                          </thead>
                          <tbody className="font-mono">
                            {subwallets.map((w, i) => (
                              <tr key={w.publicKey} className="border-t border-border/50">
                                <td className="p-2 text-muted-foreground">{i + 1}</td>
                                <td className="p-2 text-foreground/80">{w.publicKey.slice(0, 8)}...{w.publicKey.slice(-8)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground/70">
                        Keys stored in localStorage. Back up if needed.
                      </p>
                    </CardContent>
                  </Card>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
