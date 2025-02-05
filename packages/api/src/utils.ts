import { PublicKey } from "@solana/web3.js";
import { ProgramAccountParser } from "@saberhq/solana-contrib";
const DIRECTED_STAKE_ID = new PublicKey(
  "DStkUE3DjxBhVwEGNzv89eni1p7LpYuHSxxm1foggbEv",
);
export const findDirectorAddress = (authority: PublicKey) => {
  const [key] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("director"), authority.toBytes()],
    DIRECTED_STAKE_ID,
  );
  return key;
};

export const directorParser: ProgramAccountParser<{
  stakeTarget: PublicKey;
  lastUpdatedAt: bigint;
}> = {
  programID: DIRECTED_STAKE_ID,
  name: "Director",
  parse: (data: Buffer) => {
    const stakeTarget = new PublicKey(data.subarray(8, 40));
    const lastUpdatedAt = data.readBigUInt64LE(40);
    return { stakeTarget, lastUpdatedAt };
  },
};

export const removeBigint = (obj: any) => {
  return JSON.parse(
    JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
};
