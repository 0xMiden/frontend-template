import { useEffect, useState, useCallback } from "react";
import { useMiden, useMidenClient } from "@miden-sdk/react";
// `useMidenFiWallet()` returns `WalletContextState` (see
// `@miden-sdk/miden-wallet-adapter-react/dist/MidenFiSignerProvider.d.ts`),
// which exposes `address`, `connected`, and `requestTransaction` directly
// at the top level — distinct from the inner `wallet` field on the same
// return (which is a `Wallet` adapter object, not the address).
import { useMidenFiWallet } from "@miden-sdk/miden-wallet-adapter-react";
import { Transaction } from "@miden-sdk/miden-wallet-adapter-base";
import {
  TransactionRequestBuilder,
  Package,
  NoteScript,
  Note,
  NoteAssets,
  NoteMetadata,
  NoteRecipient,
  NoteStorage,
  NoteTag,
  NoteType,
  NoteAttachment,
  NoteExecutionHint,
  NoteArray,
  AccountId,
  Felt,
  FeltArray,
  Word,
} from "@miden-sdk/miden-sdk";
import { randomWord } from "@/lib/miden";
import {
  COUNTER_SLOT_NAME,
  EXPLORER_BASE_URL,
  NETWORK_POLL_INTERVAL_MS,
  NETWORK_POLL_TIMEOUT_MS,
} from "@/config";

export function useIncrementCounter(counterAddress: string) {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [count, setCount] = useState<number | null>(null);

  const { runExclusive, isReady } = useMiden();
  const {
    address: walletAddress,
    connected: walletConnected,
    requestTransaction,
  } = useMidenFiWallet();
  const client = useMidenClient();

  // Fetch the on-chain counter value. Imports the counter account on first
  // call, syncs from the network, and reads the storage map. All WASM calls
  // are serialized via runExclusive to avoid "recursive use of an object"
  // errors. Returns the fetched count (or null if the account is unreachable)
  // and also updates component state.
  const loadCount = useCallback(async (): Promise<number | null> => {
    if (!isReady || !counterAddress) return null;
    return await runExclusive(async () => {
      const counterAccountId = AccountId.fromBech32(counterAddress);
      if (!(await client.getAccount(counterAccountId))) {
        await client.importAccountById(counterAccountId);
      }
      await client.syncState();

      const account = await client.getAccount(counterAccountId);
      if (!account) {
        setCount(null);
        setError(
          `Counter account not found on-chain (${counterAddress}). Check VITE_MIDEN_COUNTER_ADDRESS / src/config.ts and confirm the counter is deployed on the configured network.`,
        );
        return null;
      }
      const countKey = Word.newFromFelts([
        new Felt(0n),
        new Felt(0n),
        new Felt(0n),
        new Felt(1n),
      ]);
      const value = account
        .storage()
        .getMapItem(COUNTER_SLOT_NAME, countKey);
      // Storage map value is a Word whose first element holds the Felt count.
      const newCount = value ? Number(value.toU64s()[0]) : 0;
      setCount(newCount);
      // Successful fetch — clear any prior unreachable/timeout error.
      setError(null);
      return newCount;
    });
  }, [isReady, client, runExclusive, counterAddress]);

  useEffect(() => {
    loadCount().catch((err) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [loadCount]);

  const increment = useCallback(async () => {
    if (!walletAddress) {
      setError(
        "No wallet account available. Connect MidenFi to a testnet account before incrementing.",
      );
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const buf = await fetch("/packages/increment_note.masp").then((r) =>
        r.arrayBuffer(),
      );
      const pkg = Package.deserialize(new Uint8Array(buf));
      const noteScript = NoteScript.fromPackage(pkg);

      const counterAccountId = AccountId.fromBech32(counterAddress);
      const walletAccountId = AccountId.fromBech32(walletAddress);

      const serialNum = randomWord();
      const storage = new NoteStorage(new FeltArray());
      const recipient = new NoteRecipient(serialNum, noteScript, storage);

      const tag = NoteTag.withAccountTarget(counterAccountId);
      const attachment = NoteAttachment.newNetworkAccountTarget(
        counterAccountId,
        NoteExecutionHint.always(),
      );
      const metadata = new NoteMetadata(
        walletAccountId,
        NoteType.Public,
        tag,
      ).withAttachment(attachment);

      const note = new Note(new NoteAssets(), metadata, recipient);
      const txRequest = new TransactionRequestBuilder()
        .withOwnOutputNotes(new NoteArray([note]))
        .build();

      if (!requestTransaction) {
        throw new Error("Wallet does not support requestTransaction");
      }
      const tx = Transaction.createCustomTransaction(
        walletAddress,
        counterAddress,
        txRequest,
      );
      await requestTransaction(tx);
      setIsSubmitting(false);

      // Capture the pre-submission count so the poll loop knows what value
      // to wait past. Not stale-safe because React batches state updates and
      // `count` here is the closed-over value from the most recent render —
      // which is exactly what we want: the value the user saw on the button.
      const previousCount = count;

      setIsWaiting(true);
      // TODO(0xMiden/miden-client#2111): The React SDK exposes no hook to
      // subscribe to account-state changes driven by the network operator
      // (our counter is Network storage mode). `useWaitForCommit` only
      // watches locally-submitted transactions, and this increment was
      // submitted by the wallet. Until #2111 lands a subscription primitive,
      // we poll the counter's storage map with a bounded timeout.
      const deadline = Date.now() + NETWORK_POLL_TIMEOUT_MS;
      let changed = false;
      while (!changed && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, NETWORK_POLL_INTERVAL_MS));
        // `loadCount()` calls `client.syncState()` internally inside
        // `runExclusive`; no need for a second `sync()` here.
        const latest = await loadCount();
        changed = latest !== null && latest !== previousCount;
      }
      setIsWaiting(false);
      if (!changed) {
        // The tx was submitted successfully but the counter hadn't updated
        // by the timeout. This can happen when testnet is slow or the
        // network operator hasn't picked up the note yet. Surface a
        // non-fatal message so the user knows to refresh or retry sync.
        setError(
          `Transaction submitted, but counter update was not observed within ${Math.round(NETWORK_POLL_TIMEOUT_MS / 1000)}s. Refresh or retry sync.`,
        );
      }
    } catch (err) {
      setIsSubmitting(false);
      setIsWaiting(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [walletAddress, requestTransaction, counterAddress, loadCount, count]);

  return {
    increment,
    count,
    isSubmitting,
    isWaiting,
    error,
    walletConnected,
    explorerUrl: `${EXPLORER_BASE_URL}/account/${counterAddress}`,
  };
}
