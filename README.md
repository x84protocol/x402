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

// Dynamic mode — resolves payTo + price from on-chain via agent NFT mint
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

// Static mode — explicit payTo + price
app.use(
  x84PaymentGate({
    payTo: "YourSolanaWalletAddress",
    network: "devnet",
    routes: {
      "POST /": { price: "$0.001", description: "Agent query" },
    },
  })
);
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

## Required: `@x402/core` patch (until v2.5.0)

> **Only needed with `@x402/core` <2.5.0.** Remove once they publish the fix to npm.

`@x402/core@2.4.0` has a bug where `PaymentOption.extra` is dropped when building payment requirements ([coinbase/x402#1139](https://github.com/coinbase/x402/pull/1139) — already fixed on `main`, not yet published).

This patch is **required** for the `agentMint` dynamic mode — without it, the facilitator never receives the agent identity for on-chain validation and receipt creation.

### Setup (2 steps)

**1.** Copy the patch file from this package into your project:

```bash
mkdir -p patches
cp node_modules/@x84-ai/x402/patches/@x402__core.patch patches/
```

**2.** Add to your `package.json`:

```json
{
  "pnpm": {
    "patchedDependencies": {
      "@x402/core": "patches/@x402__core.patch"
    }
  }
}
```

Then `pnpm install` — done. Works on EasyPanel, Docker, any CI/CD.

### When to remove

When `@x402/core` ≥2.5.0 is on npm. Then:

```bash
pnpm update @x402/core
rm -rf patches/
# remove "pnpm.patchedDependencies" from package.json
```

Track: [coinbase/x402#1139](https://github.com/coinbase/x402/pull/1139).

## Configuration

### Environment variables

| Variable         | Required | Description                           |
| ---------------- | -------- | ------------------------------------- |
| `AGENT_MINT`     | Dynamic  | Agent NFT mint address                |
| `SOLANA_RPC_URL`  | Dynamic  | Solana RPC endpoint                   |
| `SOLANA_NETWORK` | No       | `devnet` or `mainnet` (default: devnet)|

### `X84PaymentGateConfig`

| Field            | Type     | Description                                                |
| ---------------- | -------- | ---------------------------------------------------------- |
| `payTo`          | string?  | Static payment destination (not needed with `agentMint`)   |
| `agentMint`      | string?  | Agent NFT mint — resolves payTo + price from on-chain      |
| `network`        | string?  | `devnet`, `mainnet`, or CAIP-2 string                      |
| `rpcUrl`         | string?  | Solana RPC URL (required for `agentMint` mode)             |
| `routes`         | object   | Route → payment config map                                 |
| `facilitatorUrl` | string?  | Custom facilitator (default: `https://facilitator.x84.ai`) |
| `treasury`       | string?  | Override protocol fee treasury                             |
| `protocolFeeBps` | number?  | Override fee basis points (default: 300 = 3%)              |
| `serviceType`    | string?  | PDA service type (default: `a2a`)                          |

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
