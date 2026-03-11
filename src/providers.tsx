import { useMemo, type ReactNode } from "react";
import { MidenProvider } from "@miden-sdk/react";
import {
  MidenWalletAdapter,
  WalletProvider,
  WalletModalProvider,
} from "@miden-sdk/miden-wallet-adapter";
import "@miden-sdk/miden-wallet-adapter/styles.css";
import { APP_NAME, MIDEN_RPC_URL, MIDEN_PROVER } from "@/config";

export function AppProviders({ children }: { children: ReactNode }) {
  const wallets = useMemo(
    () => [new MidenWalletAdapter({ appName: APP_NAME })],
    [],
  );

  return (
    <WalletProvider wallets={wallets} autoConnect>
      <WalletModalProvider>
        <MidenProvider
          config={{ rpcUrl: MIDEN_RPC_URL, prover: MIDEN_PROVER }}
          loadingComponent={
            <div className="loading">Loading Miden WASM...</div>
          }
        >
          {children}
        </MidenProvider>
      </WalletModalProvider>
    </WalletProvider>
  );
}
