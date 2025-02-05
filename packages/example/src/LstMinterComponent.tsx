import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LstMinterWidget } from "@the-vault/lst-minter-widget";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { useState } from "react";

export const LstMinterComponent = () => {
  const api = import.meta.env.VITE_API_URL;
  const [processing, setProccessing] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const { publicKey, wallet } = useWallet();
  const { connection } = useConnection();
  const sendTransaction = async (
    serializedMessage: string,
    oldUserSolTransferEncoded: string,
  ) => {
    setPreparing(false);
    setProccessing(true);
    try {
      console.log("send transaction");
      if (!wallet || !publicKey) {
        return;
      }
      const receivedMessage = VersionedMessage.deserialize(
        bs58.decode(serializedMessage),
      );
      //Decompile the message to add priority fee and change ephemeral signer
      const transactionMessage = TransactionMessage.decompile(receivedMessage);

      //Add priority fee
      transactionMessage.instructions.unshift(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: 120_000,
        }),
      );
      transactionMessage.instructions.unshift(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: 20_000,
        }),
      );
      const oldUserSolTransfer = new PublicKey(oldUserSolTransferEncoded);
      const message = transactionMessage.compileToV0Message();
      //Create a new ephemeral signer
      const userSolTransfer = Keypair.generate();

      //Replace the ephemeral signer
      message.staticAccountKeys = message.staticAccountKeys.map((key) => {
        if (key.equals(oldUserSolTransfer)) {
          return userSolTransfer.publicKey;
        }
        return key;
      });

      const tx = new VersionedTransaction(message);
      console.log(Buffer.from(tx.serialize()).toString("base64"));
      //Sign with the ephemeral signer
      tx.sign([userSolTransfer]);
      const signature = await wallet.adapter.sendTransaction(tx, connection);
      const blockhash = await connection.getLatestBlockhash();
      console.log("confirming tx");
      const confirmation = await connection.confirmTransaction({
        signature,
        ...blockhash,
      });
      if (confirmation.value.err) {
        console.error("Error sending tx", confirmation.value.err);
      }
      console.log("Tx confirmed", signature);
    } catch (e) {
      console.error("Error sending tx", e);
    } finally {
      setProccessing(false);
    }
  };
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyItems: "flex-start",
        gap: ".5rem",
      }}
    >
      <div style={{ color: "white", fontSize: "36px" }}>Stake SOL with </div>
      <div style={{ color: "#FF8C00", fontSize: "36px" }}>Sandy Validator</div>
      <LstMinterWidget
        onButtonPress={() => {
          setPreparing(true);
          setTimeout(() => {
            setPreparing(false);
          }, 10000);
        }}
        onTxReady={({ message, userSolTransfer }) =>
          sendTransaction(message, userSolTransfer)
        }
        api={api}
        processing={preparing || processing}
        mint={"sandyYpbDQoPNP6gAhtaeXs6wNSp6xbi1hioka9zFP4"}
        address={publicKey?.toBase58()}
      />
    </div>
  );
};
