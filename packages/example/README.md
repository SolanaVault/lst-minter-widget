# Example Application

This uses @the-vault/lst-minter-widget in a React app that includes
the Solana Wallet Adapter.

This shows instantiating the widget and running the transaction it provides in
the parameter of the `onTxReady` callback.

## Cloudflare Workers Deployment

This package includes a `wrangler.toml` so you can deploy the static build to
Cloudflare Workers:

1. Set `VITE_RPC_URL` and `VITE_API_URL` in a `.env` file (they are read at build time).
2. From the repo root run `bun run --filter example deploy`.
   Wrangler will build the Vite app and upload the assets plus the worker in
   `src/worker.ts`.
3. After the first deploy you can view the assigned workers.dev URL or bind it
   to a custom route in your Cloudflare dashboard.
