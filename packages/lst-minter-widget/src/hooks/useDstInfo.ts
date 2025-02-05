import { useQuery } from "@tanstack/react-query";

export function useDstInfo(mint: string, api: string) {
  return useQuery({
    queryKey: ["dstInfo", mint],
    queryFn: async () => {
      const response = await fetch(`${api}/dstInfo?mint=${mint}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch DST info: ${response.statusText}`);
      }
      return response.json(); // Parses the readable stream as JSON
    },
    staleTime: Infinity,
  });
}
