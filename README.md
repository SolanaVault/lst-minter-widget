# LST Minter Widget
A React Widget Library for including a minting widget in your app. This is for use with LSTs supported by The [The Vault](https://thevault.finance).

## Running the Example App 
Use Bun (https://bun.sh)

Install workspace dependencies from the repo root:

```bash
bun install
```

Build all packages:

```bash
bun run build
```

Copy `packages/api/.env.example` to `packages/api/.env.dev` (or `.env.production`) and set `RPC_URL`, `HELIUS_API_KEY`, and any custom CORS origins. The Serverless config automatically loads `.env.<stage>` when you deploy or run offline. For the example app, create `packages/example/.env` (or `.env.local`) that sets `VITE_RPC_URL` and `VITE_API_URL` so Vite can reach your API.

Then start the example app:

set `VITE_API_URL` to https://direct.vaultapi.dev 

```bash
bun run dev
```


You should be able to mint an LST with the widget at http://localhost:5173.

The example app ships with `wrangler.toml`, so you can deploy it to Cloudflare Workers Sites:

```bash
cd packages/example
bun run deploy
```

## Using the widget in your own app 

The first step is to deploy the API server. You can set the CORs origin to the domain of your app in the
serverless config in `packages/api/serverless.yml`.

Deploy the API with Serverless:

```bash
cd packages/api
bunx serverless deploy --stage dev
```

Then you can include the widget in your app. Import the package locally or from npm

```bash
bun add @the-vault/lst-minter-widget
```

Then include the widget in your app. Here is an example of how to use the widget in a React app that includes the Solana Wallet Adapter.

```tsx
<LstMinterWidget
        onButtonPress={() => {
          setPreparing(true);
          setTimeout(() => {
            setPreparing(false);
          }, 10000);
        }}
        onTxReady={({ transaction }) =>
          sendTransaction(transaction)
        }
        api={api}
        processing={preparing || processing}
        mint={"vSoLxydx6akxyMD9XEcPvGYNGq6Nn66oqVb3UkGkei7"}
        target={"gridZ5cMHjWGktAQt6o36NtF7XSv19nJBrW83zmo7BM"}
        address={publicKey?.toBase58()}/>
```

The mint must be set to vSOL. The target parameter should be the vote key of your validator. If you set the mint to vSOL and do not set the target, the widget will mint undirected vSOL.

Processing is a way you to tell the widget that you are working on the transaction. onButtonPress is called by the widget when 
a Tx is being built. That is the only way for you to know that the button has been clicked. You can set a timeout while you
wait for the onTxReady to be called. The api is the base url where you deployed the API package.

## Styling the app
You can import styles.css from the package at the top of your App.tsx in your react application.

```bash
import "@the-vault/lst-minter-widget/styles.css";
```

After this line you can import additional .css that overrides these styles. Or, you can copy the file and 
modify it to your liking. If you are only interested in adapting the colors, there are variables in the root
element at the top of the file.

## Demo
You can see the widget in action at https://direct-stake-example.vaultapi.dev/. The API is deployed at
https://direct.vaultapi.dev, which you can use during bring up for your widget instance.
