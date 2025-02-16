import { BigInputTokenAmount } from "./inputs/TokenInput";
import BigNumber from "bignumber.js";
import { SOL_TOKEN_INFO } from "./constants.js";
import React from "react";
import useBalance from "./hooks/useBalance";
import { useDstInfo } from "./hooks/useDstInfo";
import useTokenInfo from "./hooks/useTokenInfo";

export interface Props {
  mint: string;
  api: string;
  onButtonPress: () => void;
  onTxReady: (txInfo: { transaction: string; }) => void;
  address: string | undefined;
  processing: boolean;
  target?: string;
}

export const LstMinterContent = ({
  mint,
  api,
  onButtonPress,
  onTxReady,
  address,
  processing,
  target
}: Props) => {
  const { data: dstInfo } = useDstInfo(mint, api);
  const { data: token } = useTokenInfo(dstInfo);
  const { data: balance } = useBalance(address, api, token);
  const [amount, setAmount] = React.useState<{
    uiAmount: string;
    raw: BigNumber;
  }>({
    uiAmount: "0",
    raw: BigNumber(0),
  });

  const getTx = async () => {
    // Call the stake API
    const result = await fetch(
      api +
        `/stake?address=${address}&mint=${mint}&amount=${amount?.raw}&balance=${balance.sol.amount}${target ? `&target=${target}` : ""}`,
    );
    return await result.json();
  };

  return (
    <div className="card">
      <div className="input-section">
        <div className="balance">
          <div>Available Balance:</div>
          <div className="balance-amount">
            {balance
              ? balance.sol.uiAmount.toLocaleString() + " SOL"
              : "Loading..."}
          </div>
        </div>
        {balance && (
          <BigInputTokenAmount
            setAmount={setAmount}
            uiAmount={amount?.uiAmount}
            maxAmount={balance.sol.amount.minus(BigNumber("1000000"))} //subtract 0.001 SOL for fees
            token={SOL_TOKEN_INFO}
          />
        )}
      </div>
      <button
        disabled={address === undefined || processing ||   amount?.raw?.eq(BigNumber(0))}
        onClick={async () => {
          if (!address || amount.raw.eq(BigNumber(0))) {
            return;
          }
          onButtonPress();
          onTxReady(await getTx());
        }}
        className="big-button"
      >
        {processing ? "Processing..." : "Stake"}
      </button>
    </div>
  );
};
