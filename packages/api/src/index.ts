import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { z } from "zod";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import dotenv from "dotenv";
import { getAllDSTs } from "./dstProgram/dstFetch.js";
import { getMetadata } from "./metadataFetch.js";
import { getStakeInstruction } from "./stakeInstruction.js";
import BigNumber from "bignumber.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { removeBigint } from "./utils.js";
import { getPriorityFeeEstimate } from "./solana/priorityFee.js";
import { VSOL_MINT } from "./consts.js";
import { getDirectInstruction } from "./getDirectInstruction.js";

dotenv.config();

const ensureEnv = (key: string) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
};

const rpcUrl = ensureEnv("RPC_URL");
const heliusApi = ensureEnv("HELIUS_API_KEY");
const heliusUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApi}`;
const connection = new Connection(rpcUrl);
const corsEnv =
  process.env.CORS_ALLOWED_ORIGIN ?? process.env.CORS_ORIGIN ?? "*";
const allowedOrigins =
  corsEnv === "*"
    ? ["*"]
    : corsEnv.split(",").map((origin) => origin.trim()).filter(Boolean);

const resolveOrigin = (requestOrigin?: string) => {
  if (allowedOrigins.includes("*")) {
    return "*";
  }
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }
  return allowedOrigins[0] ?? "*";
};

const buildCorsHeaders = (event: APIGatewayProxyEventV2) => {
  const originHeader = event.headers?.origin ?? event.headers?.Origin;
  const allowOrigin = resolveOrigin(originHeader);
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
  };
};

const jsonResponse = (
  event: APIGatewayProxyEventV2,
  statusCode: number,
  body: Record<string, unknown>,
): APIGatewayProxyResultV2 => ({
  statusCode,
  headers: {
    ...buildCorsHeaders(event),
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

const noContentResponse = (
  event: APIGatewayProxyEventV2,
): APIGatewayProxyResultV2 => ({
  statusCode: 204,
  headers: buildCorsHeaders(event),
});

const tokenQuerySchema = z.object({
  address: z.string(),
  mint: z.string(),
});

const dstInfoQuerySchema = z.object({
  mint: z.string(),
});

const stakeQuerySchema = z.object({
  address: z.string(),
  mint: z.string(),
  amount: z.string(),
  balance: z.string(),
  target: z.string().optional(),
});

const dstCache: Record<string, { data: any; expiresAt: number }> = {};
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes in milliseconds

const handleOptions = (event: APIGatewayProxyEventV2) => {
  if (event.requestContext.http.method === "OPTIONS") {
    return noContentResponse(event);
  }
  return null;
};

export const balance = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const optionsResponse = handleOptions(event);
  if (optionsResponse) {
    return optionsResponse;
  }

  const result = tokenQuerySchema.safeParse(
    event.queryStringParameters ?? {},
  );
  if (!result.success) {
    return jsonResponse(event, 400, {
      error: "Missing required query parameters: address, mint",
      issues: result.error.issues,
    });
  }

  try {
    const { address, mint } = result.data;
    const sol = await connection.getBalance(new PublicKey(address));
    const lstAta = await getAssociatedTokenAddressSync(
      new PublicKey(mint),
      new PublicKey(address),
    );
    let lst: string;
    try {
      const tokenBalance = await connection.getTokenAccountBalance(lstAta);
      lst = tokenBalance.value.amount;
    } catch {
      lst = "0";
    }
    return jsonResponse(event, 200, { sol: sol.toString(), lst });
  } catch (error) {
    console.error("Failed to fetch balance", error);
    return jsonResponse(event, 500, {
      error: "Failed to fetch balance information",
    });
  }
};

export const dstInfo = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const optionsResponse = handleOptions(event);
  if (optionsResponse) {
    return optionsResponse;
  }

  const result = dstInfoQuerySchema.safeParse(
    event.queryStringParameters ?? {},
  );

  if (!result.success) {
    return jsonResponse(event, 400, {
      error: "Missing required query parameters: mint",
      issues: result.error.issues,
    });
  }

  try {
    const { mint } = result.data;
    const cachedDst = dstCache[mint];
    const now = Date.now();
    if (cachedDst && cachedDst.expiresAt > now) {
      return jsonResponse(event, 200, removeBigint(cachedDst.data));
    }

    const dsts = await getAllDSTs(connection);
    const dst = dsts.find((entry) => entry.data.tokenMint.toString() === mint);
    if (!dst) {
      return jsonResponse(event, 404, { error: "DST not found" });
    }
    const metadata = await getMetadata(mint);
    if (!metadata) {
      return jsonResponse(event, 404, { error: "Metadata not found" });
    }

    const payload = { metadata, dst };

    dstCache[mint] = {
      data: payload,
      expiresAt: now + CACHE_DURATION_MS,
    };

    return jsonResponse(event, 200, removeBigint(payload));
  } catch (error) {
    console.error("Failed to fetch DST info", error);
    return jsonResponse(event, 500, { error: "Failed to fetch DST info" });
  }
};

export const stake = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const optionsResponse = handleOptions(event);
  if (optionsResponse) {
    return optionsResponse;
  }

  const result = stakeQuerySchema.safeParse(
    event.queryStringParameters ?? {},
  );

  if (!result.success) {
    return jsonResponse(event, 400, {
      error:
        "Missing required query parameters: address, mint, amount, balance, or target",
      issues: result.error.issues,
    });
  }
  const { address, mint, amount, balance, target } = result.data;

  try {
    const userSolTransfer = Keypair.generate();
    const ixs = [];
    if (target) {
      if (mint !== VSOL_MINT) {
        return jsonResponse(event, 400, {
          error: "Must use vSOL mint for direct staking",
        });
      }
      ixs.push(...(await getDirectInstruction(address, target, connection)));
    }
    ixs.push(
      ...(await getStakeInstruction(
        new PublicKey(mint),
        new PublicKey(address),
        new BigNumber(amount),
        new BigNumber(balance),
        PublicKey.default,
        userSolTransfer,
        connection,
      )),
    );
    const recentBlockhash = await connection.getLatestBlockhash();

    const testMessage = new TransactionMessage({
      recentBlockhash: recentBlockhash.blockhash,
      instructions: ixs,
      payerKey: new PublicKey(address),
    }).compileToV0Message();
    const testTx = new VersionedTransaction(testMessage);
    const { priorityFeeEstimate: microLamports } =
      await getPriorityFeeEstimate("Medium", testTx, heliusUrl);
    const sim = await connection.simulateTransaction(testTx);
    const units = (sim.value.unitsConsumed ?? 0) + 3000;
    ixs.unshift(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports,
      }),
    );
    ixs.unshift(
      ComputeBudgetProgram.setComputeUnitLimit({
        units,
      }),
    );

    const message = new TransactionMessage({
      recentBlockhash: recentBlockhash.blockhash,
      instructions: ixs,
      payerKey: new PublicKey(address),
    }).compileToV0Message();
    const tx = new VersionedTransaction(message);
    tx.sign([userSolTransfer]);
    return jsonResponse(event, 200, {
      transaction: Buffer.from(tx.serialize()).toString("base64"),
    });
  } catch (error) {
    console.error("Failed to create stake transaction", error);
    return jsonResponse(event, 500, {
      error: "Failed to create stake transaction",
    });
  }
};
