import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import type { RequestHandler } from "express";
import type { X84PaymentGateConfig } from "./types.js";
import { AgentResolver } from "./resolver.js";
import {
  X84_FACILITATOR_URL,
  X84_TREASURY,
  PROTOCOL_FEE_BPS,
  getNetworkId,
} from "./constants.js";

// ─── Helpers ─────────────────────────────────────────────

function getDefaultRpcUrl(network?: string): string {
  if (network === "mainnet" || network === "mainnet-beta") {
    return "https://api.mainnet-beta.solana.com";
  }
  return "https://api.devnet.solana.com";
}

// ─── Middleware ──────────────────────────────────────────

/**
 * x84 payment gate — Express middleware that wraps the Coinbase x402 SDK
 * with x84 protocol defaults (facilitator, Solana network, USDC).
 *
 * Resolves `payTo` and `price` dynamically from the on-chain PaymentRequirement
 * PDA derived from the agent's NFT mint. The on-chain PDA is the single source
 * of truth — no static payment addresses.
 *
 * ```typescript
 * app.use(x84PaymentGate({
 *   agentMint: "AgentNftMintAddress",
 *   network: "devnet",
 *   routes: {
 *     "POST /": { description: "Agent query" },
 *   },
 * }));
 * ```
 */
export function x84PaymentGate(config: X84PaymentGateConfig): RequestHandler {
  const facilitatorUrl = config.facilitatorUrl ?? X84_FACILITATOR_URL;
  const networkId = getNetworkId(config.network ?? "devnet");
  const rpcUrl = config.rpcUrl ?? getDefaultRpcUrl(config.network);
  const resolver = new AgentResolver(rpcUrl);
  const serviceType = config.serviceType ?? "a2a";

  // Build the Coinbase x402 facilitator client pointing to our facilitator
  const facilitatorClient = new HTTPFacilitatorClient({
    url: facilitatorUrl,
  });

  // Build the resource server with Solana SVM scheme
  const resourceServer = new x402ResourceServer(facilitatorClient).register(
    "solana:*",
    new ExactSvmScheme(),
  );

  // Pre-check: eagerly resolve at startup for fast-fail feedback
  resolver
    .resolve(config.agentMint, serviceType)
    .then((r) => {
      if (r && r.active) {
        const dollars = Number(r.amount) / 1_000_000;
        console.log(
          `[x84] Agent resolved: payTo=${r.payTo}, price=$${dollars}, mint=${r.tokenMint}`,
        );
      } else if (r && !r.active) {
        console.warn(
          `[x84] Agent ${config.agentMint} found but INACTIVE on-chain`,
        );
      } else {
        console.warn(
          `[x84] Agent ${config.agentMint} PaymentRequirement PDA not found on-chain (service=${serviceType}, rpc=${rpcUrl})`,
        );
      }
    })
    .catch((err) => {
      console.warn(`[x84] Pre-check failed for agent ${config.agentMint}:`, err);
    });

  // Build route config in the format @x402/express expects
  const routes: Record<string, any> = {};

  for (const [route, payment] of Object.entries(config.routes)) {
    routes[route] = {
      accepts: {
        scheme: "exact" as const,
        network: networkId,
        payTo: async () => {
          const resolved = await resolver.resolve(
            config.agentMint,
            serviceType,
          );
          if (!resolved || !resolved.active) {
            throw new Error(
              `Agent ${config.agentMint} not found or inactive on-chain`,
            );
          }
          return resolved.payTo;
        },
        price: payment.price
          ? payment.price
          : async () => {
              const resolved = await resolver.resolve(
                config.agentMint,
                serviceType,
              );
              if (!resolved) {
                throw new Error(
                  `Agent ${config.agentMint} not found on-chain`,
                );
              }
              // Convert raw token units to dollar string (USDC = 6 decimals)
              const dollars = Number(resolved.amount) / 1_000_000;
              return `$${dollars}`;
            },
        extra: {
          agentMint: config.agentMint,
          treasury: config.treasury ?? X84_TREASURY,
          protocolFeeBps: config.protocolFeeBps ?? PROTOCOL_FEE_BPS,
        },
      },
      description: payment.description ?? "x84 agent service",
      mimeType: payment.mimeType ?? "application/json",
    };
  }

  return paymentMiddleware(routes, resourceServer);
}
