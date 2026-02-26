# @x84-ai/x402

x402 payment middleware for x84 AI agents — Solana USDC payments via x84 facilitator with protocol fee split (3%).

## Install

```bash
pnpm add @x84-ai/x402
```

## Usage

### Server — Express middleware (agent receives payments)

```typescript
import express from "express";
import { x84PaymentGate } from "@x84-ai/x402/middleware";

const app = express();

// Payment config resolved from on-chain PaymentRequirement PDA
app.use(
  x84PaymentGate({
    agentMint: "YourAgentNftMintAddress",
    network: "devnet", // or "mainnet"
    rpcUrl: "https://api.devnet.solana.com",
    routes: {
      "POST /": { description: "Agent query" },
    },
  })
);
```

The `agentMint` is the agent's NFT mint address on Solana. The middleware derives the PaymentRequirement PDA from it and resolves `payTo` and `price` at runtime — the on-chain PDA is the single source of truth.

You can override the price per-route if needed:

```typescript
routes: {
  "POST /": { price: "$0.001", description: "Agent query" },
  "POST /premium": { price: "$0.01", description: "Premium query" },
}
```

### Client — paying for agent services

```typescript
import { x402Client } from "@x402/core/client";
import { X84SvmScheme } from "@x84-ai/x402/client";

const scheme = new X84SvmScheme(walletAdapter);
const client = x402Client.register("solana:*", scheme);

const response = await client.fetch("https://agent.example.com/", {
  method: "POST",
  body: JSON.stringify({ message: "Hello" }),
});
```

The `X84SvmScheme` automatically splits payments: 97% to the agent operator, 3% protocol fee to x84 treasury.

### Exports

| Entry point              | Description                                        |
| ------------------------ | -------------------------------------------------- |
| `@x84-ai/x402`          | Types, constants, `AgentResolver`                  |
| `@x84-ai/x402/middleware`| `x84PaymentGate` Express middleware                |
| `@x84-ai/x402/client`   | `X84SvmScheme` for client-side payment building    |

## Configuration

### Environment variables

| Variable         | Required | Description                           |
| ---------------- | -------- | ------------------------------------- |
| `AGENT_MINT`     | Yes      | Agent NFT mint address                |
| `SOLANA_RPC_URL`  | No       | Solana RPC endpoint (defaults by network) |
| `SOLANA_NETWORK` | No       | `devnet` or `mainnet` (default: devnet)|

### `X84PaymentGateConfig`

| Field            | Type     | Required | Description                                                |
| ---------------- | -------- | -------- | ---------------------------------------------------------- |
| `agentMint`      | string   | Yes      | Agent NFT mint — derives PaymentRequirement PDA            |
| `routes`         | object   | Yes      | Route → payment config map                                 |
| `network`        | string   | No       | `devnet`, `mainnet`, or CAIP-2 string                      |
| `rpcUrl`         | string   | No       | Solana RPC URL (defaults based on network)                 |
| `facilitatorUrl` | string   | No       | Custom facilitator (default: `https://facilitator.x84.ai`) |
| `treasury`       | string   | No       | Override protocol fee treasury                             |
| `protocolFeeBps` | number   | No       | Override fee basis points (default: 300 = 3%)              |
| `serviceType`    | string   | No       | PDA service type (default: `a2a`)                          |

## How it works

```
Client                    Agent Server              x84 Facilitator        Solana
  │                           │                          │                   │
  ├── POST /agent ───────────>│                          │                   │
  │                           ├── 402 + paymentReqs ────>│                   │
  │<── 402 Payment Required ──┤                          │                   │
  │                           │                          │                   │
  │  Build split tx:          │                          │                   │
  │  97% → agent payTo        │                          │                   │
  │  3%  → x84 treasury       │                          │                   │
  │                           │                          │                   │
  ├── POST /agent + payment ─>│                          │                   │
  │                           ├── /settle ──────────────>│                   │
  │                           │                          ├── co-sign + submit ─> TX confirmed
  │                           │                          │                   │
  │                           │                          ├── record receipt ──> PaymentReceipt PDA
  │                           │                          │                   │
  │<── 200 + response ────────┤<── settlement OK ────────┤                   │
```

## License

MIT
