// @x84-ai/x402 — x402 payment middleware for x84 AI agents

export { x84PaymentGate } from "./middleware.js";

export { AgentResolver } from "./resolver.js";
export type { ResolvedAgent } from "./resolver.js";

export type { X84PaymentGateConfig, X84RoutePayment } from "./types.js";

export {
  X84_FACILITATOR_URL,
  X84_PROGRAM_ID,
  USDC_MINT_DEVNET,
  USDC_MINT_MAINNET,
  SOLANA_DEVNET,
  SOLANA_MAINNET,
  PROTOCOL_FEE_BPS,
  X84_TREASURY,
  getNetworkId,
  getUsdcMint,
} from "./constants.js";
