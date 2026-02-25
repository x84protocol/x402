import {
  createSolanaRpc,
  mainnet,
  devnet,
  address,
  getAddressEncoder,
  getProgramDerivedAddress,
  type Address,
} from "@solana/kit";

const X84_PROGRAM_ID: Address =
  "X84XXXZsWXpanM5UzshMKZH4wUbeFNcxPWnFyTBgRP5" as Address;

/**
 * Service type PDA seeds — must match the Rust enum's `.seed()` impl:
 *   MCP => "mcp", A2A => "a2a", API => "api", Web => "web"
 */
const SERVICE_TYPE_SEEDS: Record<string, string> = {
  mcp: "mcp",
  a2a: "a2a",
  api: "api",
  web: "web",
};

interface CachedResult {
  data: ResolvedAgent;
  expiresAt: number;
}

export interface ResolvedAgent {
  /** Destination wallet (base58) */
  payTo: string;
  /** Raw token amount in smallest units (e.g. USDC lamports) */
  amount: string;
  /** SPL token mint address (base58) */
  tokenMint: string;
  /** Whether the payment requirement is active on-chain */
  active: boolean;
}

/**
 * Lightweight on-chain resolver for agent payment requirements.
 * Fetches the PaymentRequirement PDA from the x84 program and caches
 * results in-memory with configurable TTL.
 *
 * Uses `@solana/kit` — no dependency on the legacy `@solana/web3.js`.
 */
export class AgentResolver {
  private cache = new Map<string, CachedResult>();
  private rpc: ReturnType<typeof createSolanaRpc>;
  private cacheTtlMs: number;

  constructor(rpcUrl: string, options?: { cacheTtlMs?: number }) {
    // Brand the URL for @solana/kit cluster type safety, then create RPC
    const branded = rpcUrl.includes("mainnet")
      ? mainnet(rpcUrl)
      : rpcUrl.includes("devnet")
        ? devnet(rpcUrl)
        : (rpcUrl as Parameters<typeof createSolanaRpc>[0]);
    this.rpc = createSolanaRpc(branded);
    this.cacheTtlMs = options?.cacheTtlMs ?? 30_000; // 30s default
  }

  /**
   * Resolve the PaymentRequirement PDA for a given agent mint + service type.
   * Returns null if the account doesn't exist or can't be deserialized.
   */
  async resolve(
    agentMint: string,
    serviceType: string = "a2a",
  ): Promise<ResolvedAgent | null> {
    const cacheKey = `${agentMint}:${serviceType}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    try {
      // Derive PaymentRequirement PDA
      const seed = SERVICE_TYPE_SEEDS[serviceType] ?? serviceType;
      const encoder = getAddressEncoder();
      const mintBytes = encoder.encode(address(agentMint));

      const [pdaAddress] = await getProgramDerivedAddress({
        programAddress: X84_PROGRAM_ID,
        seeds: [
          new TextEncoder().encode("payment_req"),
          mintBytes,
          new TextEncoder().encode(seed),
        ],
      });

      // Fetch account data
      const response = await this.rpc
        .getAccountInfo(pdaAddress, { encoding: "base64" })
        .send();

      if (!response.value?.data) {
        console.warn(
          `[AgentResolver] No account data for PDA ${pdaAddress} (mint=${agentMint}, service=${serviceType})`,
        );
        return null;
      }

      // base64-encoded account data — RPC returns ["<base64>", "base64"] tuple
      const raw = response.value.data;
      const base64String = Array.isArray(raw) ? raw[0] : raw;
      if (typeof base64String !== "string") {
        console.warn(
          `[AgentResolver] Unexpected data format for PDA ${pdaAddress}:`,
          typeof raw,
        );
        return null;
      }

      const data = Buffer.from(base64String, "base64");
      if (data.length < 8) {
        console.warn(
          `[AgentResolver] Account data too short (${data.length} bytes) for PDA ${pdaAddress}`,
        );
        return null;
      }

      const result = this.deserializePaymentRequirement(data);
      if (!result) {
        console.warn(
          `[AgentResolver] Failed to deserialize PDA ${pdaAddress} (${data.length} bytes)`,
        );
        return null;
      }

      // Cache
      this.cache.set(cacheKey, {
        data: result,
        expiresAt: Date.now() + this.cacheTtlMs,
      });

      return result;
    } catch (err) {
      console.error(
        `[AgentResolver] Error resolving agent ${agentMint}/${serviceType}:`,
        err,
      );
      return null;
    }
  }

  /**
   * Deserialize a PaymentRequirement account from Anchor's Borsh format.
   *
   * Layout (after 8-byte discriminator):
   *   nft_mint:     Pubkey   (32 bytes)
   *   service_type: enum     (1 byte — unit variant index)
   *   scheme:       enum     (1 byte — unit variant index)
   *   amount:       u64      (8 bytes LE)
   *   token_mint:   Pubkey   (32 bytes)
   *   pay_to:       Pubkey   (32 bytes)
   *   description:  String   (4 bytes LE length + data)
   *   resource:     String   (4 bytes LE length + data)
   *   active:       bool     (1 byte)
   *   created_at:   i64      (8 bytes LE)
   *   updated_at:   i64      (8 bytes LE)
   *   bump:         u8       (1 byte)
   *
   * Verified against: program/programs/x84/src/state/payment.rs
   */
  private deserializePaymentRequirement(data: Buffer): ResolvedAgent | null {
    try {
      let offset = 8; // skip Anchor discriminator

      // nft_mint (32 bytes) — skip, we already know this
      offset += 32;

      // service_type enum (1 byte)
      offset += 1;

      // scheme enum (1 byte)
      offset += 1;

      // amount (u64 LE, 8 bytes)
      const amount = data.readBigUInt64LE(offset);
      offset += 8;

      // token_mint (32 bytes)
      const tokenMintBytes = data.subarray(offset, offset + 32);
      offset += 32;

      // pay_to (32 bytes)
      const payToBytes = data.subarray(offset, offset + 32);
      offset += 32;

      // description: String (4 byte LE length prefix + data)
      const descLen = data.readUInt32LE(offset);
      offset += 4 + descLen;

      // resource: String (4 byte LE length prefix + data)
      const resLen = data.readUInt32LE(offset);
      offset += 4 + resLen;

      // active: bool (1 byte)
      const active = data[offset] !== 0;

      // Encode pubkeys to base58 using @solana/kit address encoder
      const encoder = getAddressEncoder();
      const decoder = {
        decode: (bytes: Uint8Array): string => {
          // Re-encode bytes to Address (base58)
          // getAddressEncoder encodes Address -> bytes, we need the reverse
          // Use a manual base58 approach via the encoder's counterpart
          return address(
            encodeBase58(bytes),
          );
        },
      };

      return {
        payTo: decoder.decode(payToBytes),
        amount: amount.toString(),
        tokenMint: decoder.decode(tokenMintBytes),
        active,
      };
    } catch (err) {
      console.error(`[AgentResolver] Deserialization error:`, err);
      return null;
    }
  }

  /** Clear the in-memory cache. */
  clearCache(): void {
    this.cache.clear();
  }
}

// ─── Base58 Encoding ─────────────────────────────────────
// Minimal base58 encoder (Bitcoin alphabet) to avoid extra dependencies.
// Used to convert raw pubkey bytes back to base58 strings.

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function encodeBase58(bytes: Uint8Array): string {
  // Count leading zeros
  let zeroes = 0;
  for (const b of bytes) {
    if (b !== 0) break;
    zeroes++;
  }

  // Convert to big integer
  let num = 0n;
  for (const b of bytes) {
    num = num * 256n + BigInt(b);
  }

  // Convert to base58
  const chars: string[] = [];
  while (num > 0n) {
    const remainder = Number(num % 58n);
    num = num / 58n;
    chars.unshift(BASE58_ALPHABET[remainder]);
  }

  // Add leading '1' for each leading zero byte
  for (let i = 0; i < zeroes; i++) {
    chars.unshift("1");
  }

  return chars.join("");
}
