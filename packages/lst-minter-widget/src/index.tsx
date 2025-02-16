import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LstMinterContent, Props } from "./lstMinterContent";

const queryClient = new QueryClient();

export const LstMinterWidget = ({
  mint,
  api,
  onButtonPress,
  onTxReady,
  address,
  processing,
  target
}: Props) => {
  return (
    <QueryClientProvider client={queryClient}>
      <LstMinterContent
        onTxReady={onTxReady}
        processing={processing}
        mint={mint}
        api={api}
        onButtonPress={onButtonPress}
        address={address}
        target={target}
      />
    </QueryClientProvider>
  );
};
