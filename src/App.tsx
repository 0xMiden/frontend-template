import { useMemo, useState, useCallback, useEffect } from "react";
import {
  MidenProvider,
  useMiden,
  useSyncState,
  useAccount,
  useImportAccount,
  useTransaction,
} from "@miden-sdk/react";
import {
  MidenWalletAdapter,
  WalletProvider,
  WalletModalProvider,
  WalletMultiButton,
} from "@demox-labs/miden-wallet-adapter";
import "@demox-labs/miden-wallet-adapter/styles.css";
import { TransactionRequestBuilder } from "@miden-sdk/miden-sdk";
import counterContractCode from "./masm/counter_contract.masm?raw";
import reactLogo from "./assets/react.svg";
import midenLogo from "./assets/miden.svg";
import viteLogo from "/vite.svg";
import "./App.css";

// Pre-deployed counter contract on Miden testnet (from quickstart guide)
const COUNTER_ADDRESS = "mtst1arjemrxne8lj5qz4mg9c8mtyxg954483";
const COUNTER_SLOT_NAME = "miden::tutorials::counter";

function Counter() {
  const [error, setError] = useState<string | null>(null);

  // Step 1: Import the counter account and read its data (React SDK hooks)
  const { importAccount } = useImportAccount();
  const { account, refetch } = useAccount(COUNTER_ADDRESS);

  useEffect(() => {
    let cancelled = false;
    importAccount({ type: "id", accountId: COUNTER_ADDRESS })
      .catch(() => {}) // already imported is fine
      .then(() => { if (!cancelled) refetch(); });
    return () => { cancelled = true; };
  }, [importAccount, refetch]);

  const count = useMemo(() => {
    if (!account) return null;
    const slot = account.storage().getItem(COUNTER_SLOT_NAME);
    return slot ? Number(slot.toU64s()[3]) : 0;
  }, [account]);

  // Step 3: Increment via transaction (React SDK hook)
  const { execute, isLoading, stage } = useTransaction();

  const incrementCounter = useCallback(async () => {
    setError(null);
    try {
      await execute({
        accountId: COUNTER_ADDRESS,
        request: (client) => {
          const builder = client.createCodeBuilder();
          const lib = builder.buildLibrary(
            "external_contract::counter_contract",
            counterContractCode,
          );
          builder.linkDynamicLibrary(lib);
          const txScript = builder.compileTxScript(`
            use external_contract::counter_contract
            begin
              call.counter_contract::increment_count
            end
          `);
          return new TransactionRequestBuilder()
            .withCustomScript(txScript)
            .build();
        },
      });
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [execute, refetch]);

  return (
    <div className="card">
      <button
        className="counter-button"
        onClick={incrementCounter}
        disabled={isLoading || !account}
      >
        {isLoading ? `${stage}...` : `count is ${count ?? "..."}`}
      </button>
      <p className="account-id">Counter: {COUNTER_ADDRESS}</p>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function AppContent() {
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

export default function App() {
  const wallets = useMemo(
    () => [new MidenWalletAdapter({ appName: "Miden Template" })],
    [],
  );

  return (
    <WalletProvider wallets={wallets} autoConnect>
      <WalletModalProvider>
        <MidenProvider
          config={{ rpcUrl: "testnet", prover: "testnet" }}
          loadingComponent={
            <div className="loading">Loading Miden WASM...</div>
          }
        >
          <AppContent />
        </MidenProvider>
      </WalletModalProvider>
    </WalletProvider>
  );
}
