# LST Minter Widget
A React Widget Library for including a minting widget in your app. This is for use with LSTs supported by The [The Vault](https://thevault.finance).

## Running the Example App 
Use Yarn Berry and Node version 20.
```bash
npm install -g yarn
```

```bash 
yarn set version berry
```
Now install the packages at the root directory

```bash
yarn
```
Build all three projects under the packages directory from the root directory.
```bash
yarn build
```

Copy .env.local.example to .env.local in the example package, and copy .env.example to .env in the api package. Set the appropriate values.

Now start the API server with

```bash
yarn run api
```

And start the example app with

```bash
yarn dev
```

You should be able to mint an LST with the widget, shown in the example app at http://localhost:5173.


## Using the widget in your own app 

The first step is to deploy the API server. You can set the CORs origin to the domain of your app in the
environment variable `CORS_ORIGIN`.

A Dockerfile is included in the api package if you would like to run the API in a container.

Then you can include the widget in your app. Import the package locally or from npm

```bash
yarn add @the-vault/lst-minter-widget
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
        mint={"nordicHi2uzn7pMe4wCUzTHQXeU2N42ViDVtTrahTRn"}
        address={publicKey?.toBase58()}/>
```

The mint is the mint address of your The Vault supported LST. The publicKey comes from useWallet.
The txReady callback provides a serialized transaction you can sign with the wallet passed in to address and send to the Solana network.

You can add a target attribute to the vote pubkey of your validator, if you prefer to direct stake to your validator and mint vSOL. 
You must use the vSOL mint address if you choose to set a target. If you set the mint to vSOL and do not set the target, 
the widget will mint undirected vSOL.

Processing is a way you to tell the widget that you are working on the transaction. onButtonPress is called by the widget when 
a Tx is being built. That is the only way for you to know that the button has been clicked. You can set a timeout while you
wait for the onTxReady to be called. The api is the base url where you deployed the API package.

## Styling the app
You can import styles.css from the package at the top of your App.tsx in your react application.

```bash
import "@the-vault/lst-minter-widget/styles.css";
```

After this line you can import additional .css that overrides these styles. Or, you can copy the file and 
modify it to your liking. If you are only interested in adapting the colors, there are vairables in the root
element at the top of the file.

## Demo
You can see the widget in action at https://lst-minter-demo.pages.dev/. The API is deployed at
https://lstminter.boundlessendeavors.llc, which you can use during bring up for your widget instance.
