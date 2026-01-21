import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LstMinterWidget, Mode } from "@the-vault/lst-minter-widget";
import { VersionedTransaction } from "@solana/web3.js";
import { useState } from "react";
import { VSOL_MINT } from "@the-vault/lst-minter-api/dist/consts";
import { getPhantomProvider } from "./phantom.ts";

const DIRECTED_VALIDATOR_NAME = "Grid Systems Validator";
const DIRECTED_TARGET = "gridZ5cMHjWGktAQt6o36NtF7XSv19nJBrW83zmo7BM";

export const LstMinterComponent = () => {
  const api = import.meta.env.VITE_API_URL;
  const [processing, setProccessing] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [mode, setMode] = useState<Mode>("stake");
  const { publicKey, wallet } = useWallet();
  const { connection } = useConnection();
  const sendTransaction = async (
    serializedTx: string,
  ) => {
    setPreparing(false);
    setProccessing(true);
    try {
      console.log("send transaction");
      if (!wallet || !publicKey) {
        return;
      }
      const tx = VersionedTransaction.deserialize(
        Buffer.from(serializedTx, "base64")
      );
      console.log("tx", await connection.simulateTransaction(tx));
      const phantomProvider = getPhantomProvider();
      let signature;
      if(phantomProvider) {
          const result = await phantomProvider.signAndSendTransaction(tx);
          signature = result.signature;
      } else {
          signature = await wallet.adapter.sendTransaction(tx, connection);
      }
      console.log("signature", signature);
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
      <div style={{ color: "white", fontSize: "36px" }}>
        Stake SOL with directed vSOL
      </div>
      <div style={{ color: "#FF8C00", fontSize: "36px" }}>
        {DIRECTED_VALIDATOR_NAME}
      </div>
      <LstMinterWidget
        onButtonPress={() => {
          setPreparing(true);
          setTimeout(() => {
            setPreparing(false);
          }, 10000);
        }}
        onTxReady={({ transaction }) => sendTransaction(transaction)}
        api={api}
        processing={preparing || processing}
        mint={VSOL_MINT}
        target={DIRECTED_TARGET}
        address={publicKey?.toBase58()}
        mode={mode}
        onModeChange={setMode}
      />
    </div>
  );
};
