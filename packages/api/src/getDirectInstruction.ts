import { buildDirectTX, DIRECTED_STAKE_PROGRAM_ID, makeDirectedStakeProgram } from '@thevault/directed-stake'
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { findDirectorAddress } from '@thevault/directed-stake';
import { AnchorProvider } from '@coral-xyz/anchor';
import { NodeWallet } from "@coral-xyz/anchor/dist/esm/nodewallet.js";

const wallet = new NodeWallet(Keypair.generate());

export async function getDirectInstruction(owner: string, target: string, connection: Connection) {
    const directorAddress = findDirectorAddress(new PublicKey(owner));
    const directorAddressInfo = await connection.getAccountInfo(directorAddress);
    console.log("DSI Address",directorAddress);
    console.log("DSI",directorAddressInfo);
    const isUpdatingExisting = directorAddressInfo?.owner.equals(DIRECTED_STAKE_PROGRAM_ID);
    const wallet = new NodeWallet(Keypair.generate());
    const provider = new AnchorProvider(connection, wallet);
    const program = makeDirectedStakeProgram(provider);
    return await buildDirectTX(
        program,
        new PublicKey(owner),
        new PublicKey(target),
        isUpdatingExisting
    );
}
