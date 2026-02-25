/** Route-level payment configuration */
export interface X84RoutePayment {
  /** Price string (e.g. "$0.001", "$1.00"). Optional when using agentMint — resolved from on-chain. */
  price?: string;
  /** Human-readable description of the resource */
  description?: string;
  /** MIME type of the response */
  mimeType?: string;
}

/**
 * Configuration for x84PaymentGate middleware.
 *
 * Either `payTo` (static) or `agentMint` (dynamic on-chain resolution) must
 * be provided. When `agentMint` is set, the middleware resolves `payTo` and
 * optionally `price` from the on-chain PaymentRequirement PDA at runtime.
 */
export interface X84PaymentGateConfig {
  /** Solana address to receive payments (static mode) */
  payTo?: string;
  /** Network identifier — "devnet" | "mainnet-beta" | "mainnet" or full CAIP-2 string */
  network?: string;
  /** Route payment map, e.g. { "POST /": { price: "$0.001" } } */
  routes: Record<string, X84RoutePayment>;
  /** Custom facilitator URL (defaults to https://facilitator.x84.ai) */
  facilitatorUrl?: string;
  /** Override x84 treasury address for protocol fee */
  treasury?: string;
  /** Override protocol fee in basis points (default: 300 = 3%) */
  protocolFeeBps?: number;

  // ── Dynamic on-chain resolution ──────────────────────────

  /** Agent NFT mint address — enables dynamic payTo + price resolution from on-chain */
  agentMint?: string;
  /** Service type for PDA derivation (default: "a2a") */
  serviceType?: string;
  /** Solana RPC URL for on-chain reads (required when using agentMint) */
  rpcUrl?: string;
}
