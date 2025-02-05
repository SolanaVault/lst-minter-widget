import * as React from "react";
import Vault from "../icons/VaultIcon";
import SolanaToken from "../icons/SolanaToken";
import { FaRegQuestionCircle } from "react-icons/fa";
import { SOL_MINT, TokenInfo, VSOL_MINT } from "../constants.js";

const iconForAddress = (tokenInfo: TokenInfo): React.ReactNode => {
  if (tokenInfo.mint === SOL_MINT) {
    return <SolanaToken />;
  }
  if (tokenInfo.mint == VSOL_MINT) {
    return <Vault />;
  }
  return <img src={tokenInfo.iconUrl} />;
};

export const TokenIcon: React.FC<{
  token: TokenInfo;
  size?: number;
}> = ({ token, size = 16 }) => {
  const icon = iconForAddress(token);
  return (
    <div
      className={`token-icon-container`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
      }}
    >
      {icon ?? (
        <FaRegQuestionCircle style={{ width: "100%", height: "100%" }} />
      )}
    </div>
  );
};
