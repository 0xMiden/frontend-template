import { useState } from "react";
import { useWallet } from "@miden-sdk/miden-wallet-adapter-react";
import {
  AllowedPrivateData,
  PrivateDataPermission,
  WalletAdapterNetwork,
  WalletReadyState,
} from "@miden-sdk/miden-wallet-adapter-base";
import { useWalletSend } from "./useWalletSend";
import type { SendInput } from "./journal";

function SendForm({
  disabled,
  send,
}: {
  disabled: boolean;
  send: (input: Omit<SendInput, "sender">) => Promise<void>;
}) {
  const [recipient, setRecipient] = useState("");
  const [faucetId, setFaucetId] = useState("");
  const [amount, setAmount] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void send({ recipient, faucetId, amount });
      }}
    >
      <fieldset disabled={disabled}>
        <legend>Public Testnet note</legend>
        <label>
          Recipient Testnet address
          <input
            required
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="mtst1…"
          />
        </label>
        <label>
          Token faucet Testnet address
          <input
            required
            value={faucetId}
            onChange={(e) => setFaucetId(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="mtst1…"
          />
        </label>
        <label>
          Amount in token base units
          <input
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="numeric"
            pattern="[1-9][0-9]*"
            aria-describedby="amount-help"
          />
        </label>
        <p id="amount-help">
          Use whole base units from the token’s decimals. Bread checks token
          support, balance and fees before approval.
        </p>
        <button type="submit">Request public send</button>
      </fieldset>
    </form>
  );
}

export function MiniApp() {
  const wallet = useWallet();
  const flow = useWalletSend(wallet);
  const [connectionError, setConnectionError] = useState("");
  const installed = wallet.wallets.find(
    (w) => w.readyState === WalletReadyState.Installed,
  );
  const selectedReady =
    wallet.wallet?.readyState === WalletReadyState.Installed;
  const originalSender =
    !!wallet.address && flow.journal?.sender === wallet.address;

  async function connection(action: () => Promise<void>) {
    setConnectionError("");
    try {
      await action();
    } catch (error) {
      setConnectionError(
        error instanceof Error ? error.message : "Connection failed.",
      );
    }
  }

  return (
    <main className="mini-app">
      <header>
        <p className="eyebrow">Miden · Testnet starter</p>
        <h1>Send with Bread</h1>
        <p>
          Create a public note using your connected wallet. Bread builds, signs
          and submits the request after approval.
        </p>
      </header>
      <section aria-label="Wallet connection">
        <h2>Connect your wallet</h2>
        {!installed && (
          <p>
            Open this page in Bread’s app browser or a browser with the Bread
            extension. Connection becomes available when a provider is detected.
          </p>
        )}
        {wallet.connected ? (
          <>
            <p>
              Connected Testnet sender: <code>{wallet.address}</code>
            </p>
            <button
              disabled={wallet.connecting || flow.pending}
              onClick={() =>
                void connection(() =>
                  wallet.connect(
                    PrivateDataPermission.UponRequest,
                    WalletAdapterNetwork.Testnet,
                    AllowedPrivateData.None,
                  ),
                )
              }
            >
              Refresh connection
            </button>
            <button
              disabled={wallet.disconnecting || flow.pending}
              onClick={() => void connection(wallet.disconnect)}
            >
              Disconnect
            </button>
          </>
        ) : wallet.wallet ? (
          <button
            disabled={!selectedReady || wallet.connecting}
            onClick={() =>
              void connection(() =>
                wallet.connect(
                  PrivateDataPermission.UponRequest,
                  WalletAdapterNetwork.Testnet,
                  AllowedPrivateData.None,
                ),
              )
            }
          >
            {wallet.connecting ? "Connecting…" : "Connect Bread"}
          </button>
        ) : (
          <button
            disabled={!installed}
            onClick={() => installed && wallet.select(installed.adapter.name)}
          >
            Choose Bread
          </button>
        )}
        {connectionError && <p role="alert">{connectionError}</p>}
      </section>
      <section aria-label="Send request">
        <h2>Request a send</h2>
        <p>
          This example requests no private balances or notes. Your request
          addresses and amount are saved in this browser so a reload does not
          trigger a duplicate send.
        </p>
        <SendForm
          key={wallet.address ?? "disconnected"}
          send={flow.send}
          disabled={
            !wallet.connected ||
            !wallet.requestSend ||
            !wallet.waitForTransaction ||
            flow.pending ||
            !!flow.journal ||
            flow.blocked
          }
        />
        {flow.error && <p role="alert">{flow.error}</p>}
        {flow.pending && <p role="status">Waiting for the wallet…</p>}
      </section>
      {flow.journal && (
        <section aria-label="Saved request">
          <h2>Saved request</h2>
          <p>
            Sender: <code>{flow.journal.sender}</code>
          </p>
          <p>
            Recipient: <code>{flow.journal.recipient}</code>
          </p>
          <p>
            Faucet: <code>{flow.journal.faucetId}</code> · Amount:{" "}
            {flow.journal.amount} base units
          </p>
          {flow.journal.requestId ? (
            <p>
              Accepted request ID: <code>{flow.journal.requestId}</code>
            </p>
          ) : (
            <p role="status">
              No accepted ID was saved. The request may have reached the wallet.
              Check wallet activity and preserve this record; automatic retry is
              blocked.
            </p>
          )}
          {flow.journal.txHash && (
            <p role="status">
              Wallet reported result: <code>{flow.journal.txHash}</code>.
              Confirm chain inclusion and note consumption separately when
              settlement matters.
            </p>
          )}
          {!originalSender && (
            <p>
              Reconnect the original Testnet sender to reconcile this request.
            </p>
          )}
          <button
            disabled={
              !wallet.connected ||
              !originalSender ||
              !wallet.waitForTransaction ||
              !flow.journal.requestId ||
              flow.pending
            }
            onClick={() => void flow.reconcile()}
          >
            Check accepted request
          </button>
          {flow.journal.phase === "reported" && (
            <button
              disabled={!wallet.connected || !originalSender || flow.pending}
              onClick={() => void flow.startAnother()}
            >
              Start another request
            </button>
          )}
        </section>
      )}
      <footer>
        <p>
          A send creates a note. The recipient must discover and consume it to
          receive the asset in its vault.
        </p>
        <a href="https://docs.miden.xyz/builder/mini-apps/">
          Mini-app developer guides
        </a>
      </footer>
    </main>
  );
}
