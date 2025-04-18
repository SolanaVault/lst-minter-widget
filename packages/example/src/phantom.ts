import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { SendOptions } from 'vite';

type DisplayEncoding = 'utf8' | 'hex';

type PhantomEvent = 'connect' | 'disconnect' | 'accountChanged';

type PhantomRequestMethod =
    | 'connect'
    | 'disconnect'
    | 'signAndSendTransaction'
    | 'signTransaction'
    | 'signAllTransactions'
    | 'signMessage';

interface ConnectOpts {
    onlyIfTrusted: boolean;
}

export interface PhantomProvider {
    publicKey: PublicKey | null;
    isConnected: boolean | null;
    signAndSendTransaction: (
        transaction: VersionedTransaction,
        opts?: SendOptions
    ) => Promise<{ signature: string; publicKey: PublicKey }>;
    signTransaction: (transaction: VersionedTransaction) => Promise<VersionedTransaction>;
    signAllTransactions: (transactions: VersionedTransaction[]) => Promise<VersionedTransaction[]>;
    signMessage: (message: Uint8Array | string, display?: DisplayEncoding) => Promise<any>;
    connect: (opts?: Partial<ConnectOpts>) => Promise<{ publicKey: PublicKey }>;
    disconnect: () => Promise<void>;
    on: (event: PhantomEvent, handler: (args: any) => void) => void;
    request: (method: PhantomRequestMethod, params: any) => Promise<unknown>;
}

export const getPhantomProvider = (): PhantomProvider | undefined => {
    if ('phantom' in window) {
        const anyWindow: any = window;
        const provider = anyWindow.phantom?.solana;

        if (provider?.isPhantom) {
            return provider;
        }
    }

    window.open('https://phantom.app/', '_blank');
};
