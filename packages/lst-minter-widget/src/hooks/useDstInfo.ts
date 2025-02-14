import { useQuery } from "@tanstack/react-query";
import { VSOL_MINT } from '../constants';

export function useDstInfo(mint: string, api: string) {
  return useQuery({
    queryKey: ["dstInfo", mint],
    queryFn: async () => {
      if(mint === VSOL_MINT) {
        return null;
      }
      const response = await fetch(`${api}/dstInfo?mint=${mint}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch DST info: ${response.statusText}`);
      }
      return response.json(); // Parses the readable stream as JSON
    },
    staleTime: Infinity,
  });
}
