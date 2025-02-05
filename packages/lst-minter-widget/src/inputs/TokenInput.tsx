import React from "react";
import BigNumber from "bignumber.js";
import useBalance from "../hooks/useBalance";
import "../styles.css";
import { SOL_MINT, SOL_TOKEN_INFO, TokenInfo } from "../constants.js";
import { TokenIcon } from "../components/TokenIcon"; // Import the CSS file

const LAMPORTS_PER_SOL = 1e9;

export const formatTokenAmount = (
  token: TokenInfo,
  amount: BigNumber,
): string =>
  Number(amount.div(10 ** token.decimals).toFixed(token.decimals)).toString();

export const uiAmountToRaw = (
  token: TokenInfo,
  amount: string,
): BigNumber | null => {
  const amt = BigNumber(amount);
  if (amt.isNaN()) {
    return null;
  }
  return amt.times(10 ** token.decimals);
};

const InputTokenAmountInner: React.FC<{
  token: TokenInfo;
  disabled?: boolean;
  uiAmount?: string;
  setUiAmount?: (amount: string) => void;
}> = ({ token, disabled = false, uiAmount, setUiAmount }) => {
  return (
    <div className={`input-token-amount-inner ${disabled ? "" : "editable"}`}>
      {disabled ? (
        <div className="input-amount">{uiAmount}</div>
      ) : (
        <input
          type="number"
          placeholder="0.00"
          min={0}
          step={0.1}
          className="input-amount"
          value={uiAmount}
          onChange={(e) => setUiAmount?.(e.target.value)}
        />
      )}
    </div>
  );
};

const MaxBalanceButton = ({ onClick }: { onClick: () => void }) => (
  <button className="max-button" onClick={onClick}>
    Max
  </button>
);

const MaxBalanceSOL: React.FC<{
  setAmount: (amount: BigNumber) => void;
}> = ({ setAmount }) => {
  return (
    <MaxBalanceCommon
      onMaxClick={(balance) =>
        setAmount(balance.minus(0.001 * LAMPORTS_PER_SOL))
      }
    />
  );
};

const MaxBalanceCommon: React.FC<{
  balance?: BigNumber;
  onMaxClick: (balance: BigNumber) => void;
}> = ({ balance, onMaxClick }) => {
  if (!balance) {
    return <div />;
  }
  return <MaxBalanceButton onClick={() => onMaxClick(balance)} />;
};

interface BigTokenInputProps {
  token: TokenInfo;
  uiAmount?: string;
  setAmount?: (amount: { uiAmount: string; raw: BigNumber | null }) => void;
  disabled?: boolean;
  maxAmount?: BigNumber;
}

export const BigInputTokenAmount = ({
  token,
  uiAmount,
  setAmount,
  disabled,
  maxAmount,
}: BigTokenInputProps) => {
  const setRawAmount = (raw: BigNumber) => {
    setAmount?.({
      uiAmount: formatTokenAmount(token, raw),
      raw,
    });
  };
  const showIcon = false;
  return (
    <div className="big-token-input input">
      <InputTokenAmountInner
        uiAmount={uiAmount}
        token={token}
        setUiAmount={(uiAmount) => {
          setAmount?.({
            uiAmount,
            raw: uiAmountToRaw(token, uiAmount),
          });
        }}
        disabled={disabled}
      />
      <div className="spread-input">
        {setAmount && (
          <div>
            {maxAmount && (
              <MaxBalanceCommon balance={maxAmount} onMaxClick={setRawAmount} />
            )}
          </div>
        )}
        <div className="token-symbol-container">
          <div>{showIcon && <TokenIcon token={token} size={24} />}</div>
          <div className="token-symbol"> {token.symbol}</div>
        </div>
      </div>
    </div>
  );
};
