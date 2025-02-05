export interface TokenInfo {
  mint: string;
  symbol: string;
  decimals: number;
  iconUrl?: string;
}
export const VSOL_MINT = "vSoLxydx6akxyMD9XEcPvGYNGq6Nn66oqVb3UkGkei7";

export const SOL_MINT = "So11111111111111111111111111111111111111112";

export const VSOL_TOKEN_INFO: TokenInfo = {
  symbol: "vSOL",
  decimals: 9,
  mint: VSOL_MINT,
};

export const SOL_TOKEN_INFO: TokenInfo = {
  symbol: "SOL",
  decimals: 9,
  mint: SOL_MINT,
};
