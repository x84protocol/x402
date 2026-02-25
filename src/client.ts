import {
  getSetComputeUnitLimitInstruction,
  setTransactionMessageComputeUnitPrice,
} from "@solana-program/compute-budget";
import {
  fetchMint,
  findAssociatedTokenPda,
  getTransferCheckedInstruction,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  appendTransactionMessageInstructions,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  partiallySignTransactionMessageWithSigners,
  pipe,
  prependTransactionMessageInstruction,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  createSolanaRpc,
  mainnet,
  devnet,
  type TransactionSigner,
  type Address,
} from "@solana/kit";
import { X84_TREASURY, PROTOCOL_FEE_BPS } from "./constants.js";

const MEMO_PROGRAM_ADDRESS =
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr" as Address;

const DEFAULT_COMPUTE_UNIT_LIMIT = 40_000;
const DEFAULT_COMPUTE_UNIT_PRICE_MICROLAMPORTS = 500_000n;

function createRpcClient(network: string, customRpcUrl?: string) {
  if (customRpcUrl) {
    return createSolanaRpc(customRpcUrl as any);
  }
  if (network.includes("5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp")) {
    return createSolanaRpc(mainnet("https://api.mainnet-beta.solana.com"));
  }
  return createSolanaRpc(devnet("https://api.devnet.solana.com"));
}

/**
 * x84 SVM payment scheme — builds transactions with protocol fee split.
 *
 * Instead of a single transfer (100% to payTo), this scheme creates:
 * - Transfer (100% - protocolFee) to payTo
 * - Transfer protocolFee to x84 treasury
 *
 * Implements the SchemeNetworkClient interface from @x402/core.
 */
export class X84SvmScheme {
  readonly scheme = "exact" as const;

  constructor(
    private readonly signer: TransactionSigner,
    private readonly config?: { rpcUrl?: string },
  ) {}

  async createPaymentPayload(
    x402Version: number,
    paymentRequirements: any,
  ) {
    const rpc = createRpcClient(
      paymentRequirements.network,
      this.config?.rpcUrl,
    );

    const tokenMint = await fetchMint(
      rpc,
      paymentRequirements.asset as Address,
    );
    const tokenProgramAddress = tokenMint.programAddress;

    if (
      tokenProgramAddress.toString() !== TOKEN_PROGRAM_ADDRESS.toString() &&
      tokenProgramAddress.toString() !== TOKEN_2022_PROGRAM_ADDRESS.toString()
    ) {
      throw new Error("Asset was not created by a known token program");
    }

    const totalAmount = BigInt(paymentRequirements.amount);

    // Calculate split
    const treasury = (paymentRequirements.extra?.treasury ??
      X84_TREASURY) as Address;
    const feeBps = paymentRequirements.extra?.protocolFeeBps ?? PROTOCOL_FEE_BPS;
    const feeAmount = (totalAmount * BigInt(feeBps)) / 10_000n;
    const payeeAmount = totalAmount - feeAmount;

    // Derive ATAs
    const [sourceATA] = await findAssociatedTokenPda({
      mint: paymentRequirements.asset as Address,
      owner: this.signer.address,
      tokenProgram: tokenProgramAddress,
    });

    const [payeeATA] = await findAssociatedTokenPda({
      mint: paymentRequirements.asset as Address,
      owner: paymentRequirements.payTo as Address,
      tokenProgram: tokenProgramAddress,
    });

    const [treasuryATA] = await findAssociatedTokenPda({
      mint: paymentRequirements.asset as Address,
      owner: treasury,
      tokenProgram: tokenProgramAddress,
    });

    // Build transfer instructions
    const transferToPayee = getTransferCheckedInstruction(
      {
        source: sourceATA,
        mint: paymentRequirements.asset as Address,
        destination: payeeATA,
        authority: this.signer,
        amount: payeeAmount,
        decimals: tokenMint.data.decimals,
      },
      { programAddress: tokenProgramAddress },
    );

    const transferToTreasury = getTransferCheckedInstruction(
      {
        source: sourceATA,
        mint: paymentRequirements.asset as Address,
        destination: treasuryATA,
        authority: this.signer,
        amount: feeAmount,
        decimals: tokenMint.data.decimals,
      },
      { programAddress: tokenProgramAddress },
    );

    const feePayer = paymentRequirements.extra?.feePayer as Address | undefined;
    if (!feePayer) {
      throw new Error(
        "feePayer is required in paymentRequirements.extra for SVM transactions",
      );
    }

    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    // Random nonce memo for uniqueness
    const nonce = crypto.getRandomValues(new Uint8Array(16));
    const memoIx = {
      programAddress: MEMO_PROGRAM_ADDRESS,
      accounts: [] as readonly never[],
      data: new TextEncoder().encode(
        Array.from(nonce)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(""),
      ),
    };

    const tx = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) =>
        setTransactionMessageComputeUnitPrice(
          DEFAULT_COMPUTE_UNIT_PRICE_MICROLAMPORTS,
          tx,
        ),
      (tx) => setTransactionMessageFeePayer(feePayer, tx),
      (tx) =>
        prependTransactionMessageInstruction(
          getSetComputeUnitLimitInstruction({
            units: DEFAULT_COMPUTE_UNIT_LIMIT,
          }),
          tx,
        ),
      (tx) =>
        appendTransactionMessageInstructions(
          [transferToPayee, transferToTreasury, memoIx],
          tx,
        ),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    );

    const signedTransaction =
      await partiallySignTransactionMessageWithSigners(tx);
    const base64EncodedWireTransaction =
      getBase64EncodedWireTransaction(signedTransaction);

    return {
      x402Version,
      payload: { transaction: base64EncodedWireTransaction },
    };
  }
}
