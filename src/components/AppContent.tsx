import { useMiden, useSyncState } from "@miden-sdk/react";
import { WalletMultiButton } from "@miden-sdk/miden-wallet-adapter";
import reactLogo from "@/assets/react.svg";
import midenLogo from "@/assets/miden.svg";
import viteLogo from "/vite.svg";
import { Counter } from "@/components/Counter";
import "./AppContent.css";

export function AppContent() {
  const { isReady, isInitializing, error } = useMiden();
  const { syncHeight } = useSyncState();

  if (error) {
    return (
      <div className="loading">
        <p>Failed to initialize Miden client</p>
        <p className="error">{error.message}</p>
      </div>
    );
  }

  if (isInitializing || !isReady) {
    return <div className="loading">Initializing Miden client...</div>;
  }

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank" rel="noreferrer">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank" rel="noreferrer">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
        <a href="https://docs.miden.io" target="_blank" rel="noreferrer">
          <img src={midenLogo} className="logo miden" alt="Miden logo" />
        </a>
      </div>
      <h1>Vite + React + Miden</h1>
      <div className="wallet-section">
        <WalletMultiButton />
      </div>
      <Counter />
      <p className="read-the-docs">
        Testnet block: {syncHeight ?? "syncing..."} | Click on the Vite, React,
        and Miden logos to learn more
      </p>
    </>
  );
}
