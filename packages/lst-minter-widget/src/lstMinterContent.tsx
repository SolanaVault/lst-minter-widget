import { BigInputTokenAmount } from "./inputs/TokenInput";
import BigNumber from "bignumber.js";
import { SOL_TOKEN_INFO, VSOL_TOKEN_INFO } from "./constants.js";
import React from "react";
import useBalance from "./hooks/useBalance";
import { useDstInfo } from "./hooks/useDstInfo";
import useTokenInfo from "./hooks/useTokenInfo";

export type Mode = "stake" | "unstake";

export interface Props {
  mint: string;
  api: string;
  onButtonPress: () => void;
  onTxReady: (txInfo: { transaction: string; }) => void;
  address: string | undefined;
  processing: boolean;
  target?: string;
  mode?: Mode;
  onModeChange?: (mode: Mode) => void;
}

export const LstMinterContent = ({
  mint,
  api,
  onButtonPress,
  onTxReady,
  address,
  processing,
  target,
  mode = "stake",
  onModeChange,
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

  const isStakeMode = mode === "stake";
  const currentToken = isStakeMode ? SOL_TOKEN_INFO : token || VSOL_TOKEN_INFO;
  const currentBalance = isStakeMode ? balance?.sol : balance?.lst;

  const getTx = async () => {
    if (isStakeMode) {
      // Call the stake API
      const result = await fetch(
        api +
          `/stake?address=${address}&mint=${mint}&amount=${amount?.raw}&balance=${balance.sol.amount}${target ? `&target=${target}` : ""}`,
      );
      return await result.json();
    } else {
      // Call the unstake API
      const result = await fetch(
        api + `/unstake?address=${address}&amount=${amount?.raw}`,
      );
      return await result.json();
    }
  };

  return (
    <div className="card">
      {onModeChange && (
        <div className="mode-toggle">
          <button
            className={`mode-button ${isStakeMode ? "active" : ""}`}
            onClick={() => {
              onModeChange("stake");
              setAmount({ uiAmount: "0", raw: BigNumber(0) });
            }}
          >
            Stake
          </button>
          <button
            className={`mode-button ${!isStakeMode ? "active" : ""}`}
            onClick={() => {
              onModeChange("unstake");
              setAmount({ uiAmount: "0", raw: BigNumber(0) });
            }}
          >
            Unstake
          </button>
        </div>
      )}
      <div className="input-section">
        <div className="balance">
          <div>Available Balance:</div>
          <div className="balance-amount">
            {currentBalance
              ? currentBalance.uiAmount.toLocaleString() + " " + currentToken.symbol
              : "Loading..."}
          </div>
        </div>
        {balance && (
          <BigInputTokenAmount
            setAmount={setAmount}
            uiAmount={amount?.uiAmount}
            maxAmount={isStakeMode
              ? balance.sol.amount.minus(BigNumber("1000000")) // subtract 0.001 SOL for fees
              : balance.lst.amount
            }
            token={currentToken}
          />
        )}
      </div>
      <button
        disabled={address === undefined || processing || amount?.raw?.eq(BigNumber(0))}
        onClick={async () => {
          if (!address || amount.raw.eq(BigNumber(0))) {
            return;
          }
          onButtonPress();
          onTxReady(await getTx());
        }}
        className="big-button"
      >
        {processing ? "Processing..." : isStakeMode ? "Stake" : "Unstake"}
      </button>
    </div>
  );
};
