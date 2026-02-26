/** Route-level payment configuration */
export interface X84RoutePayment {
  /** Price override (e.g. "$0.001"). If omitted, resolved from on-chain PaymentRequirement PDA. */
  price?: string;
  /** Human-readable description of the resource */
  description?: string;
  /** MIME type of the response */
  mimeType?: string;
}

/**
 * Configuration for x84PaymentGate middleware.
 *
 * Resolves `payTo` and `price` from the on-chain PaymentRequirement PDA
 * derived from the agent's NFT mint address. The on-chain PDA is the
 * single source of truth for payment routing.
 */
export interface X84PaymentGateConfig {
  /** Agent NFT mint address — used to derive the PaymentRequirement PDA */
  agentMint: string;
  /** Network identifier — "devnet" | "mainnet-beta" | "mainnet" or full CAIP-2 string */
  network?: string;
  /** Route payment map, e.g. { "POST /": { description: "Agent query" } } */
  routes: Record<string, X84RoutePayment>;
  /** Custom facilitator URL (defaults to https://facilitator.x84.ai) */
  facilitatorUrl?: string;
  /** Override x84 treasury address for protocol fee */
  treasury?: string;
  /** Override protocol fee in basis points (default: 300 = 3%) */
  protocolFeeBps?: number;
  /** Service type for PDA derivation (default: "a2a") */
  serviceType?: string;
  /** Solana RPC URL for on-chain reads (defaults based on network) */
  rpcUrl?: string;
}
