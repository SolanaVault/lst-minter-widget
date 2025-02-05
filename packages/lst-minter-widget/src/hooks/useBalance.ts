import BigNumber from "bignumber.js";
import { useQuery } from "@tanstack/react-query";
import { formatTokenAmount } from "../inputs/TokenInput.js";
import { SOL_TOKEN_INFO, TokenInfo } from "../constants.js";

export default function useBalance(
  address: string,
  api: string,
  token: TokenInfo,
) {
  return useQuery({
    queryKey: ["balance", address],
    queryFn: async () => {
      if (!address) {
        return {
          sol: {
            amount: BigNumber("0"),
            uiAmount: "0",
          },
          lst: {
            amount: BigNumber("0"),
            uiAmount: "0",
          },
        };
      }
      const response = await fetch(
        `${api}/balance?address=${address}&mint=${token.mint}`,
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch balance: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(data);
      const lstAmount = BigNumber(data.lst);
      const solAmount = BigNumber(data.sol);
      return {
        sol: {
          amount: solAmount,
          uiAmount: formatTokenAmount(SOL_TOKEN_INFO, solAmount),
        },
        lst: {
          amount: lstAmount,
          uiAmount: formatTokenAmount(token, lstAmount),
        },
      };
    },
    staleTime: Infinity,
  });
}
