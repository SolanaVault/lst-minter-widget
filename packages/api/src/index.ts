import Fastify from "fastify";
import cors from "@fastify/cors";
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
import bs58 from "bs58";
import { getAllDSTs } from "./dstProgram/dstFetch.js";
import { getMetadata } from "./metadataFetch.js";
import { getStakeInstruction } from "./stakeInstruction.js";
import BigNumber from "bignumber.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { removeBigint } from "./utils.js";
import { getPriorityFeeEstimate } from './solana/priorityFee.js';
import { VSOL_MINT } from './consts.js';
import { getDirectInstruction } from './getDirectInstruction.js';

dotenv.config();

const fastify = Fastify({ logger: true });
const host = process.env.HOST || "localhost";
const port = parseInt(process.env.PORT) || 3001;
const rpcUrl = process.env.RPC_URL;
if (!rpcUrl) {
  throw new Error("RPC_URL is required");
}
const heliusApi = process.env.HELIUS_API_KEY;
if (!heliusApi) {
    throw new Error("HELIUS_API_KEY is required");
}
const heliusUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApi}`;
const connection = new Connection(rpcUrl);

const tokenQuerySchema = z.object({
  address: z.string(),
  mint: z.string(),
});

fastify.get("/balance", async (request, reply) => {
  const result = tokenQuerySchema.safeParse(request.query);

  if (!result.success) {
    return reply.status(400).send({
      error: "Missing required query parameters: address, mint",
      issues: result.error.issues, // Optional: shows what exactly failed
    });
  }
  const { address, mint } = result.data;
  const sol = await connection.getBalance(new PublicKey(address));
  const lstAta = await getAssociatedTokenAddressSync(
    new PublicKey(mint),
    new PublicKey(address),
  );
  let lst: string;
  try {
    const result = await connection.getTokenAccountBalance(lstAta);
    console.log("result", result);
    lst = result.value.amount;
  } catch {
    lst = "0";
  }
  return reply.send({ sol: sol.toString(), lst });
});

const dstInfoQuerySchema = z.object({
  mint: z.string(),
});

const dstCache: Record<string, { data: any; expiresAt: number }> = {};
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes in milliseconds

fastify.get("/dstInfo", async (request, reply) => {
  const result = dstInfoQuerySchema.safeParse(request.query);

  if (!result.success) {
    return reply.status(400).send({
      error: "Missing required query parameters: address, mint",
      issues: result.error.issues, // Optional: shows what exactly failed
    });
  }

  const { mint } = result.data;
  const cachedDst = dstCache[mint];
  const now = Date.now();
  if (cachedDst && cachedDst.expiresAt > now) {
    console.log("Serving from cache");
    return reply.send(removeBigint(cachedDst.data));
  }

  const dsts = await getAllDSTs(connection);
  const dst = dsts.find((dst) => dst.data.tokenMint.toString() === mint);
  if (!dst) {
    return reply.status(404).send({ error: "DST not found" });
  }
  const metadata = await getMetadata(mint);
  if (!metadata) {
    return reply.status(404).send({ error: "Metadata not found" });
  }

  // Cache the response
  dstCache[mint] = {
    data: { metadata, dst },
    expiresAt: now + CACHE_DURATION_MS,
  };

  return reply.send(removeBigint({ metadata, dst }));
});

const stakeQuerySchema = z.object({
  address: z.string(),
  mint: z.string(),
  amount: z.string(),
  balance: z.string(),
  target: z.string().optional(),
});

// Stake route
fastify.get("/stake", async (request, reply) => {
  const result = stakeQuerySchema.safeParse(request.query);

  if (!result.success) {
    return reply.status(400).send({
      error: "Missing required query parameters: address, mint, amount, balance",
      issues: result.error.issues, // Optional: shows what exactly failed
    });
  }
  const { address, mint, amount, balance, target } = result.data;
  const userSolTransfer = Keypair.generate();
  const ixs = [];
  if(target) {
   // create direct stake instruction
    if(mint !== VSOL_MINT) {
        return reply.status(400).send({
            error: "Must use vSOL mint for direct staking",
        });
    }
    ixs.push(...await getDirectInstruction(address, target, connection));
  }
  ixs.push(...await getStakeInstruction(
    new PublicKey(mint),
    new PublicKey(address),
    new BigNumber(amount),
    new BigNumber(balance),
    PublicKey.default,
    userSolTransfer,
    connection,
  ));
  const recentBlockhash = await connection.getLatestBlockhash();

  //Build a Tx to figure out CUs and priority fee
  const testMessage = new TransactionMessage({
    recentBlockhash: recentBlockhash.blockhash,
    instructions: ixs,
    payerKey: new PublicKey(address),
  }).compileToV0Message();
  const testTx = new VersionedTransaction(testMessage);
  const {priorityFeeEstimate: microLamports } = await getPriorityFeeEstimate("Medium", testTx, heliusUrl);
  const sim = await connection.simulateTransaction(testTx);
  const units = sim.value.unitsConsumed + 3000;
  ixs.unshift(ComputeBudgetProgram.setComputeUnitPrice({
    microLamports
  }));
  ixs.unshift(ComputeBudgetProgram.setComputeUnitLimit({
    units
  }));

  //Build the final Tx
  const message = new TransactionMessage({
    recentBlockhash: recentBlockhash.blockhash,
    instructions: ixs,
    payerKey: new PublicKey(address),
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);
  tx.sign([userSolTransfer]);
  return reply.send({
    transaction: bs58.encode(tx.serialize()),
  });
});

// Start the server
async function startServer() {
  console.log("Allowed CORS origin:", process.env.CORS_ORIGIN);
  try {
    await fastify.register(cors, {
      origin: process.env.CORS_ORIGIN,
    });

    await fastify.listen({ port, host });
    fastify.log.info(`Server listening at http://localhost:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

startServer();
