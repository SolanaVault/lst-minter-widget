import { Program, AnchorProvider, BN, type Idl } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  StakeProgram,
  SystemProgram,
  TransactionInstruction,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_STAKE_HISTORY_PUBKEY,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { STAKE_POOL_ADDRESS, VSOL_MINT } from "../consts.js";
import {
  getStakePoolAccount,
  STAKE_POOL_PROGRAM_ID,
  stakePoolInfo,
} from "@solana/spl-stake-pool";
import IDL from "./liquidUnstakePool.json" with { type: "json" };

// Minimum stake account balance required
const MINIMUM_ACTIVE_STAKE = 1_000_000; // 0.001 SOL

interface WithdrawAccount {
  stakeAddress: PublicKey;
  voteAddress?: PublicKey;
  poolAmount: BN;
}

// Validator stake info status
const ValidatorStakeInfoStatus = {
  Active: 0,
  DeactivatingTransient: 1,
  ReadyForRemoval: 2,
};

async function findStakeProgramAddress(
  programId: PublicKey,
  voteAccountAddress: PublicKey,
  stakePoolAddress: PublicKey,
): Promise<PublicKey> {
  const [publicKey] = PublicKey.findProgramAddressSync(
    [
      voteAccountAddress.toBuffer(),
      stakePoolAddress.toBuffer(),
    ],
    programId,
  );
  return publicKey;
}

async function findTransientStakeProgramAddress(
  programId: PublicKey,
  voteAccountAddress: PublicKey,
  stakePoolAddress: PublicKey,
  seed: BN,
): Promise<PublicKey> {
  const seedBuffer = seed.toArrayLike(Buffer, "le", 8);
  const [publicKey] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("transient"),
      voteAccountAddress.toBuffer(),
      stakePoolAddress.toBuffer(),
      seedBuffer,
    ],
    programId,
  );
  return publicKey;
}

function lamportsToSol(lamports: BN): number {
  return lamports.toNumber() / LAMPORTS_PER_SOL;
}

/**
 * Prepare withdraw accounts for unstaking from the stake pool
 * Based on the implementation in liquidUnstakeClient.ts
 */
async function prepareWithdrawAccounts(
  connection: Connection,
  stakePoolProgramId: PublicKey,
  stakePoolAddress: PublicKey,
  amount: BN,
  skipFee?: boolean,
): Promise<WithdrawAccount[]> {
  const stakePool = await stakePoolInfo(connection, stakePoolAddress);
  const validatorList = stakePool.validatorList;


  if (!validatorList || validatorList.length === 0) {
    throw new Error("No accounts found");
  }

  const minBalanceForRentExemption = await connection.getMinimumBalanceForRentExemption(
    StakeProgram.space,
  );
  const minBalance = new BN(minBalanceForRentExemption + MINIMUM_ACTIVE_STAKE);

  let accounts: Array<{
    type: "preferred" | "active" | "transient" | "reserve";
    voteAddress?: PublicKey;
    stakeAddress: PublicKey;
    lamports: BN;
  }> = [];

  // Prepare accounts
  for (const validator of validatorList) {
    if (validator.status !== ValidatorStakeInfoStatus.Active.toString()) {
      continue;
    }

    const stakeAccountAddress = await findStakeProgramAddress(
      stakePoolProgramId,
      new PublicKey(validator.voteAccountAddress),
      stakePoolAddress,
    );

    if (validator.activeStakeLamports !== "0") {
      const isPreferred = stakePool?.preferredWithdrawValidatorVoteAddress?.equals(
        new PublicKey(validator.voteAccountAddress),
      );
      accounts.push({
        type: isPreferred ? "preferred" : "active",
        voteAddress: new PublicKey(validator.voteAccountAddress),
        stakeAddress: stakeAccountAddress,
        lamports: new BN(validator.activeStakeLamports),
      });
    }

    const transientStakeLamports = new BN(validator.transientStakeLamports).sub(minBalance);
    if (transientStakeLamports.gt(new BN(0))) {
      const transientStakeAccountAddress = await findTransientStakeProgramAddress(
        stakePoolProgramId,
        new PublicKey(validator.voteAccountAddress),
        stakePoolAddress,
        new BN(validator.transientSeedSuffixStart),
      );
      accounts.push({
        type: "transient",
        voteAddress: new PublicKey(validator.voteAccountAddress),
        stakeAddress: transientStakeAccountAddress,
        lamports: transientStakeLamports,
      });
    }
  }

  // Sort from highest to lowest balance
  accounts = accounts.sort((a, b) => b.lamports.sub(a.lamports).toNumber());


  const reserveStake = await connection.getAccountInfo(new PublicKey(stakePool.reserveStake));
  const reserveStakeBalance = new BN((reserveStake?.lamports ?? 0) - minBalanceForRentExemption);
  if (reserveStakeBalance.gt(new BN(0))) {
    accounts.push({
      type: "reserve",
      stakeAddress: new PublicKey(stakePool.reserveStake),
      lamports: reserveStakeBalance,
    });
  }

  // Prepare the list of accounts to withdraw from
  const withdrawFrom: WithdrawAccount[] = [];
  let remainingAmount = new BN(amount);

  const fee = stakePool.stakeWithdrawalFee;
  const inverseFee = {
    numerator: fee.denominator.sub(fee.numerator),
    denominator: fee.denominator,
  };

  const calcPoolTokensForDeposit = (stakeLamports: BN): BN => {
    if (stakePool.poolTokenSupply === "0" || stakePool.totalLamports === "0") {
      return stakeLamports;
    }
    const numerator = stakeLamports.mul(new BN(stakePool.poolTokenSupply));
    return numerator.div(new BN(stakePool.totalLamports));
  };

  for (const type of ["preferred", "active", "transient", "reserve"]) {
    const filteredAccounts = accounts.filter((a) => a.type === type);

    for (const { stakeAddress, voteAddress, lamports } of filteredAccounts) {
      if (lamports.lte(minBalance) && type === "transient") {
        continue;
      }

      let availableForWithdrawal = calcPoolTokensForDeposit(lamports);

      if (!skipFee && !inverseFee.numerator.isZero()) {
        availableForWithdrawal = availableForWithdrawal
          .mul(inverseFee.denominator)
          .div(inverseFee.numerator);
      }

      const poolAmount = BN.min(availableForWithdrawal, remainingAmount);
      if (poolAmount.lte(new BN(0))) {
        continue;
      }

      withdrawFrom.push({ stakeAddress, voteAddress, poolAmount });
      remainingAmount = remainingAmount.sub(poolAmount);

      if (remainingAmount.isZero()) {
        break;
      }
    }

    if (remainingAmount.isZero()) {
      break;
    }
  }

  // Not enough stake to withdraw the specified amount
  if (remainingAmount.gt(new BN(0))) {
    throw new Error(
      `No stake accounts found in this pool with enough balance to withdraw ${lamportsToSol(
        amount,
      )} pool tokens.`,
    );
  }


  return withdrawFrom;
}

export const LIQUID_UNSTAKER_POOL_ACCOUNT = new PublicKey(
  "9nyw5jxhzuSs88HxKJyDCsWBZMhxj2uNXsFcyHF5KBAb",
);

/**
 * Gets the user's vSOL balance
 */
export async function getUserVsolBalance(
  connection: Connection,
  userPublicKey: PublicKey,
): Promise<BN> {
  const userVsolAccount = getAssociatedTokenAddressSync(
    new PublicKey(VSOL_MINT),
    userPublicKey,
  );

  try {
    const balance = await connection.getTokenAccountBalance(userVsolAccount);
    return new BN(balance.value.amount);
  } catch {
    // Account doesn't exist, balance is 0
    return new BN(0);
  }
}

// Type for the pool data
interface PoolData {
  authority: PublicKey;
  solVault: PublicKey;
  lpMint: PublicKey;
  managerFeeAccount: PublicKey;
  totalLpTokens: BN;
  totalAccruedFees: BN;
  totalDeactivatingStake: BN;
  feeMax: number;
  feeMin: number;
  minSolForMinFee: BN;
  managerFeePct: number;
  bump: number;
  solVaultBump: number;
  solVaultLamports: BN;
  solVaultLamportsCap: BN;
}

interface LiquidUnstakerProgram {
  account: {
    pool: {
      fetch: (address: PublicKey) => Promise<PoolData>;
    };
  };
  methods: {
    liquidUnstakeLst: (
      lstAmounts: BN[],
      minimumLamportsOut: BN | null,
    ) => {
      accounts: (accounts: Record<string, PublicKey>) => {
        remainingAccounts: (accounts: { pubkey: PublicKey; isWritable: boolean; isSigner: boolean }[]) => {
          instruction: () => Promise<TransactionInstruction>;
        };
      };
    };
  };
  programId: PublicKey;
}

function findWithdrawAuthorityProgramAddress(
  programId: PublicKey,
  stakePoolAddress: PublicKey,
): PublicKey {
  const [publicKey] = PublicKey.findProgramAddressSync(
    [stakePoolAddress.toBuffer(), Buffer.from("withdraw")],
    programId,
  );
  return publicKey;
}

async function getLiquidUnstakerPool(connection: Connection) {
  // Create a minimal provider for read-only operations
  const provider = {
    connection,
    publicKey: PublicKey.default,
  } as unknown as AnchorProvider;

  const program = new Program(IDL as Idl, provider) as unknown as LiquidUnstakerProgram;

  const [solVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("sol_vault"), LIQUID_UNSTAKER_POOL_ACCOUNT.toBuffer()],
    program.programId,
  );

  const [lpMintPubkey] = PublicKey.findProgramAddressSync(
    [Buffer.from("lp_mint"), LIQUID_UNSTAKER_POOL_ACCOUNT.toBuffer()],
    program.programId,
  );

  const data = await program.account.pool.fetch(LIQUID_UNSTAKER_POOL_ACCOUNT);

  return {
    program,
    solVault,
    lpMintPubkey,
    data,
  };
}

/**
 * Creates instructions to unstake vSOL using the liquid unstaker pool.
 * This redeems vSOL for SOL via the liquid unstaker.
 * Returns instructions and signers needed for the transaction.
 */
export async function createLiquidUnstakeInstruction(
  connection: Connection,
  userPublicKey: PublicKey,
  vsolAmount: BN,
  minimumLamportsOut: BN | null = null,
): Promise<{ instructions: TransactionInstruction[]; signers: Keypair[] }> {
  const { program, solVault, data: unstakePoolInfo } = await getLiquidUnstakerPool(connection);

  // Get stake pool info for the vSOL stake pool
  const stakePoolAddress = new PublicKey(STAKE_POOL_ADDRESS);
  const stakePoolAccount = await getStakePoolAccount(connection, stakePoolAddress);
  const stakePool = stakePoolAccount.account.data;

  // Find stake pool withdraw authority
  const withdrawAuthority = findWithdrawAuthorityProgramAddress(
    STAKE_POOL_PROGRAM_ID,
    stakePoolAddress,
  );

  // User's vSOL token account
  const userLstAccount = getAssociatedTokenAddressSync(
    new PublicKey(VSOL_MINT),
    userPublicKey,
  );

  // Retrieve the validator stake accounts in the stake pool that will be split
  let withdrawAccounts = await prepareWithdrawAccounts(
    connection,
    STAKE_POOL_PROGRAM_ID,
    stakePoolAddress,
    vsolAmount,
    false, // skipFee
  );

  // Limit to max 5 accounts (program limitation)
  withdrawAccounts = withdrawAccounts.slice(0, 5);

  // Generate keypairs for new stake accounts
  const newStakeAccountKeypairs = withdrawAccounts.map(() => Keypair.generate());

  // Build remaining accounts
  const remainingAccounts = [
    // Validator stake addresses to split from
    ...withdrawAccounts.map((wa) => ({
      pubkey: wa.stakeAddress,
      isWritable: true,
      isSigner: false,
    })),
    // New stake accounts (signers)
    ...newStakeAccountKeypairs.map((keypair) => ({
      pubkey: keypair.publicKey,
      isWritable: true,
      isSigner: true,
    })),
    // Stake info PDAs for tracking
    ...newStakeAccountKeypairs.map((keypair) => {
      const [pubkey] = PublicKey.findProgramAddressSync(
        [Buffer.from("stake_account_info"), keypair.publicKey.toBuffer()],
        program.programId,
      );
      return {
        pubkey,
        isWritable: true,
        isSigner: false,
      };
    }),
  ];

  // Pre-instructions to create stake accounts
  const stakeAccountRentExemption = await connection.getMinimumBalanceForRentExemption(
    StakeProgram.space,
  );

  const preInstructions: TransactionInstruction[] = newStakeAccountKeypairs.map((keypair) =>
    SystemProgram.createAccount({
      fromPubkey: userPublicKey,
      newAccountPubkey: keypair.publicKey,
      lamports: stakeAccountRentExemption,
      space: StakeProgram.space,
      programId: StakeProgram.programId,
    }),
  );

  // Build the amounts array (must be 5 elements)
  const amounts: BN[] = withdrawAccounts.map((wa) => wa.poolAmount);
  while (amounts.length < 5) {
    amounts.push(new BN(0));
  }

  // Build the liquid unstake instruction
  const liquidUnstakeIx = await program.methods
    .liquidUnstakeLst(amounts, minimumLamportsOut)
    .accounts({
      pool: LIQUID_UNSTAKER_POOL_ACCOUNT,
      payer: userPublicKey,
      userTransferAuthority: userPublicKey,
      userLstAccount: userLstAccount,
      solVault: solVault,
      userSolAccount: userPublicKey,
      managerFeeAccount: unstakePoolInfo.managerFeeAccount,
      stakePool: stakePoolAddress,
      stakePoolValidatorList: stakePool.validatorList,
      stakePoolWithdrawAuthority: withdrawAuthority,
      stakePoolManagerFeeAccount: stakePool.managerFeeAccount,
      stakePoolMint: stakePool.poolMint,
      tokenProgram: TOKEN_PROGRAM_ID,
      stakeProgram: StakeProgram.programId,
      stakePoolProgram: STAKE_POOL_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      clock: SYSVAR_CLOCK_PUBKEY,
      stakeHistory: SYSVAR_STAKE_HISTORY_PUBKEY,
    })
    .remainingAccounts(remainingAccounts)
    .instruction();

  return {
    instructions: [...preInstructions, liquidUnstakeIx],
    signers: newStakeAccountKeypairs,
  };
}

/**
 * Creates instructions to unstake vSOL using Jupiter swap API.
 * This is a fallback if the liquid unstaker pool doesn't have enough liquidity.
 */
export async function createJupiterUnstakeInstruction(
  userPublicKey: PublicKey,
  vsolAmount: BN,
  jupiterApiEndpoint: string,
  jupiterApiKey?: string,
): Promise<{ instructions: TransactionInstruction[]; transaction?: string }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (jupiterApiKey) {
    headers["x-api-key"] = jupiterApiKey;
  }

  // Get quote from Jupiter
  const quoteUrl = new URL(`${jupiterApiEndpoint}/swap/v1/quote`);
  quoteUrl.searchParams.set("inputMint", VSOL_MINT);
  quoteUrl.searchParams.set("outputMint", "So11111111111111111111111111111111111111112");
  quoteUrl.searchParams.set("amount", vsolAmount.toString());
  quoteUrl.searchParams.set("slippageBps", "100"); // 1% slippage
  quoteUrl.searchParams.set("swapMode", "ExactIn");

  console.log("Jupiter quote request URL:", quoteUrl.toString());
  console.log("Jupiter API endpoint:", jupiterApiEndpoint);
  console.log("Has API key:", !!jupiterApiKey);

  const quoteResponse = await fetch(quoteUrl.toString(), { headers });

  console.log("Jupiter quote response status:", quoteResponse.status, quoteResponse.statusText);

  if (!quoteResponse.ok) {
    const errorBody = await quoteResponse.text();
    console.log("Jupiter quote error body:", errorBody);
    throw new Error(`Failed to get Jupiter quote: ${quoteResponse.statusText} - ${errorBody}`);
  }
  const quoteData = await quoteResponse.json() as Record<string, unknown>;
  console.log("Jupiter quote success, routes found:", (quoteData as any)?.routePlan?.length ?? "unknown");

  // Get swap transaction from Jupiter
  const swapUrl = `${jupiterApiEndpoint}/swap/v1/swap`;
  console.log("Jupiter swap request URL:", swapUrl);

  const swapRequestBody = {
    userPublicKey: userPublicKey.toString(),
    quoteResponse: quoteData,
    wrapAndUnwrapSol: true,
    useSharedAccounts: true,
    dynamicComputeUnitLimit: true,
    dynamicSlippage: true,
    prioritizationFeeLamports: {
      priorityLevelWithMaxLamports: {
        priorityLevel: "medium",
        maxLamports: 1000000, // 0.001 SOL max priority fee
        global: false,
      },
    },
  };

  console.log("Jupiter swap request body:", JSON.stringify(swapRequestBody, null, 2));

  const swapResponse = await fetch(swapUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(swapRequestBody),
  });

  console.log("Jupiter swap response status:", swapResponse.status, swapResponse.statusText);

  if (!swapResponse.ok) {
    const errorBody = await swapResponse.text();
    console.log("Jupiter swap error body:", errorBody);
    throw new Error(`Failed to get Jupiter swap: ${swapResponse.statusText} - ${errorBody}`);
  }

  const swapData = await swapResponse.json() as { swapTransaction: string };
  console.log("Jupiter swap success, transaction length:", swapData.swapTransaction?.length ?? 0);

  // Jupiter returns a base64 encoded transaction
  // We return this directly as we can't easily extract instructions from a versioned tx
  return {
    instructions: [],
    transaction: swapData.swapTransaction,
  };
}
