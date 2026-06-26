import { type ReactNode } from "react";
import { MidenProvider } from "@miden-sdk/react";
import { MidenFiSignerProvider } from "@miden-sdk/miden-wallet-adapter-react";
import { WalletAdapterNetwork } from "@miden-sdk/miden-wallet-adapter-base";
import { APP_NAME, MIDEN_RPC_URL, MIDEN_PROVER } from "@/config";

// v0.15 provider order — MidenProvider runs OUTSIDE the signer provider.
//
// When a signer provider (MidenFiSignerProvider) is an *ancestor* of MidenProvider,
// v0.15 MidenProvider treats it as its external keystore and intentionally does NOT
// create the WebClient until that signer connects (it sees `signerContext.isConnected
// === false` and returns early). With a wallet that hasn't connected — e.g. before the
// user connects, or in any environment without the MidenFi extension — the app would
// then hang forever on "Initializing Miden client…", and even the public counter read
// could never run. (This is undocumented in the migration guide; verified against
// `web-sdk` `packages/react-sdk/src/context/MidenProvider.tsx`.)
//
// This template never signs *through* MidenProvider — the only write (the increment)
// is submitted by the wallet adapter's `requestTransaction`, not the client keystore.
// So we run MidenProvider in local-keystore mode (no signer above it → it initializes
// immediately and the read path works without a connected wallet) and keep
// MidenFiSignerProvider *inside*, purely to provide the connect button + the wallet's
// `requestTransaction`. MidenFiSignerProvider works standalone (it provides its own
// WalletContext + SignerContext; no MultiSignerProvider required).
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <MidenProvider
      config={{ rpcUrl: MIDEN_RPC_URL, prover: MIDEN_PROVER }}
      loadingComponent={<div className="loading">Loading Miden WASM...</div>}
    >
      <MidenFiSignerProvider
        appName={APP_NAME}
        network={WalletAdapterNetwork.Testnet}
        autoConnect
      >
        {children}
      </MidenFiSignerProvider>
    </MidenProvider>
  );
}
