import { useState } from "react";
import { WalletProvider } from "@miden-sdk/miden-wallet-adapter-react";
import {
  AllowedPrivateData,
  PrivateDataPermission,
  WalletAdapterNetwork,
} from "@miden-sdk/miden-wallet-adapter-base";
import { wallets } from "./wallets";
import { MiniApp } from "./MiniApp";

export function WalletRoot() {
  const [error, setError] = useState("");
  return (
    <WalletProvider
      wallets={wallets}
      network={WalletAdapterNetwork.Testnet}
      privateDataPermission={PrivateDataPermission.UponRequest}
      allowedPrivateData={AllowedPrivateData.None}
      autoConnect={false}
      localStorageKey="miden-mini-app:wallet"
      onError={(error) => setError(error.message || error.name)}
    >
      <MiniApp />
      {error && (
        <aside className="mini-app" role="alert">
          <p>Wallet: {error}</p>
          <button onClick={() => setError("")}>Dismiss wallet message</button>
        </aside>
      )}
    </WalletProvider>
  );
}
