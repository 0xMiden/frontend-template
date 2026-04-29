import { type ReactNode } from "react";
import { MidenProvider } from "@miden-sdk/react";
import { MidenFiSignerProvider } from "@miden-sdk/miden-wallet-adapter-react";
import { WalletAdapterNetwork } from "@miden-sdk/miden-wallet-adapter-base";
import { APP_NAME, MIDEN_RPC_URL, MIDEN_PROVER } from "@/config";

// MidenFiSignerProvider must wrap MidenProvider — MidenProvider reads
// SignerContext during initialization (to wire its external-keystore client),
// so the signer context has to exist before the provider mounts.
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <MidenFiSignerProvider
      appName={APP_NAME}
      network={WalletAdapterNetwork.Testnet}
      autoConnect
    >
      <MidenProvider
        config={{ rpcUrl: MIDEN_RPC_URL, prover: MIDEN_PROVER }}
        loadingComponent={
          <div className="loading">Loading Miden WASM...</div>
        }
      >
        {children}
      </MidenProvider>
    </MidenFiSignerProvider>
  );
}
