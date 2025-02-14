import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LstMinterWidget } from "@the-vault/lst-minter-widget";
import {
  VersionedTransaction
} from "@solana/web3.js";
import bs58 from "bs58";
import { useState } from "react";
import { VSOL_MINT } from '@the-vault/lst-minter-api/dist/consts';

export const LstMinterComponent = () => {
  const api = import.meta.env.VITE_API_URL;
  const [processing, setProccessing] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [isGridSol, setIsGridSol] = useState(true);
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
        bs58.decode(serializedTx),
      );
      console.log("tx", await connection.simulateTransaction(tx));
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
        <button className="switch-button" onClick={() => setIsGridSol((prev) => !prev)}>
          Switch to {isGridSol ? "The Vault" : "Grid Systems Validator"}
        </button>
        <div style={{color: "white", fontSize: "36px"}}>Stake SOL with</div>
        <div style={{color: "#FF8C00", fontSize: "36px"}}>{isGridSol ? "Grid Systems Validator" : "The Vault"}</div>
        <LstMinterWidget
            onButtonPress={() => {
              setPreparing(true);
              setTimeout(() => {
                setPreparing(false);
              }, 10000);
            }}
            onTxReady={({transaction}) =>
                sendTransaction(transaction)
            }
            api={api}
            processing={preparing || processing}
            mint={isGridSol ? "gridBR1TSJcV1JjAEE9g7ouoiVaEgDNT3dhY6n9oKQq" : VSOL_MINT}
            address={publicKey?.toBase58()}
        />
      </div>
  );
};
