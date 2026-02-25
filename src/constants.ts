// ─── x84 Protocol Defaults ──────────────────────────────

/** Default x84 facilitator URL */
export const X84_FACILITATOR_URL = "https://facilitator.x84.ai";

/** x84 on-chain program ID */
export const X84_PROGRAM_ID = "X84XXXZsWXpanM5UzshMKZH4wUbeFNcxPWnFyTBgRP5";

// ─── USDC Token Mints ───────────────────────────────────

export const USDC_MINT_DEVNET =
  "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr";

export const USDC_MINT_MAINNET =
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// ─── CAIP-2 Network IDs ─────────────────────────────────

export const SOLANA_DEVNET = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
export const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

// ─── Protocol Fee ──────────────────────────────────────────

/** x84 protocol fee in basis points (300 = 3%) */
export const PROTOCOL_FEE_BPS = 300;

/** x84 fee treasury wallet */
export const X84_TREASURY = "8VF2ZAp9C1RKeV2XmKBnCQdbhGuNZaLZ1x7mTCSGsMH9";

// ─── Helpers ─────────────────────────────────────────────

export function getNetworkId(
  network: "devnet" | "mainnet-beta" | "mainnet" | string,
): string {
  if (network === "devnet") return SOLANA_DEVNET;
  if (network === "mainnet" || network === "mainnet-beta") return SOLANA_MAINNET;
  // Already a CAIP-2 string
  if (network.startsWith("solana:")) return network;
  return SOLANA_DEVNET;
}

export function getUsdcMint(networkId: string): string {
  if (networkId === SOLANA_MAINNET) return USDC_MINT_MAINNET;
  return USDC_MINT_DEVNET;
}
