import { useMemo, useState, useCallback, useEffect } from "react";
import {
  useSyncState,
  useAccount,
  useImportAccount,
} from "@miden-sdk/react";
import {
  useWallet,
  Transaction,
} from "@miden-sdk/miden-wallet-adapter";
import {
  TransactionRequestBuilder,
  Package,
  NoteScript,
  Note,
  NoteAssets,
  NoteMetadata,
  NoteRecipient,
  NoteInputs,
  NoteTag,
  NoteType,
  NoteAttachment,
  NoteExecutionHint,
  OutputNote,
  OutputNoteArray,
  AccountId,
  Felt,
  FeltArray,
  Word,
} from "@miden-sdk/miden-sdk";
import { randomWord } from "@/lib/miden";
import {
  COUNTER_SLOT_NAME,
  EXPLORER_BASE_URL,
  NETWORK_SYNC_DELAY_MS,
} from "@/config";

export function useIncrementCounter(counterAddress: string) {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);

  const { address: walletAddress, connected, requestTransaction } = useWallet();
  const { importAccount } = useImportAccount();
  const { account, refetch } = useAccount(counterAddress);
  const { sync } = useSyncState();

  // Import the counter account so the local client tracks it.
  // The catch is intentional — the account may already be imported.
  useEffect(() => {
    importAccount({ type: "id", accountId: counterAddress }).catch(() => {});
  }, [importAccount, counterAddress]);

  // Read count from StorageMap
  const count = useMemo(() => {
    if (!account) return null;
    const countKey = Word.newFromFelts([
      new Felt(0n),
      new Felt(0n),
      new Felt(0n),
      new Felt(1n),
    ]);
    const value = account.storage().getMapItem(COUNTER_SLOT_NAME, countKey);
    return value ? Number(value.toU64s()[3]) : 0;
  }, [account]);

  const increment = useCallback(async () => {
    if (!walletAddress || !requestTransaction) return;
    setError(null);
    setIsSubmitting(true);
    try {
      // Load pre-compiled increment-note package
      const buf = await fetch("/packages/increment_note.masp").then((r) =>
        r.arrayBuffer(),
      );
      const pkg = Package.deserialize(new Uint8Array(buf));
      const noteScript = NoteScript.fromPackage(pkg);

      const counterAccountId = AccountId.fromBech32(counterAddress);
      const walletAccountId = AccountId.fromBech32(walletAddress);

      // Build note recipient
      const serialNum = randomWord();
      const inputs = new NoteInputs(new FeltArray());
      const recipient = new NoteRecipient(serialNum, noteScript, inputs);

      // Build note metadata targeting the network counter account
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

      // Assemble the note and submit via wallet adapter
      const note = new Note(new NoteAssets(), metadata, recipient);
      const outputNote = OutputNote.full(note);
      const txRequest = new TransactionRequestBuilder()
        .withOwnOutputNotes(new OutputNoteArray([outputNote]))
        .build();

      const tx = Transaction.createCustomTransaction(
        walletAddress,
        counterAddress,
        txRequest,
      );
      await requestTransaction(tx);
      setIsSubmitting(false);

      // Wait for network to process the note, then re-sync
      setIsWaiting(true);
      await new Promise((r) => setTimeout(r, NETWORK_SYNC_DELAY_MS));
      await sync();
      await refetch();
      setIsWaiting(false);
    } catch (err) {
      setIsSubmitting(false);
      setIsWaiting(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [walletAddress, requestTransaction, counterAddress, sync, refetch]);

  return {
    increment,
    count,
    isSubmitting,
    isWaiting,
    error,
    walletConnected: connected,
    explorerUrl: `${EXPLORER_BASE_URL}/account/${counterAddress}`,
  };
}
