import { useCallback, useEffect, useRef, useState } from "react";
import { SendTransaction } from "@miden-sdk/miden-wallet-adapter-base";
import type { WalletContextState } from "@miden-sdk/miden-wallet-adapter-react";
import {
  clearCompleted,
  JOURNAL_KEY,
  JOURNAL_LOCK,
  readJournal,
  validateSend,
  writeJournal,
} from "./journal";
import type { SendInput, SendJournal } from "./journal";

type SendWallet = Pick<
  WalletContextState,
  "connected" | "address" | "requestSend" | "waitForTransaction"
>;
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Wallet outcome unresolved. Check wallet activity before retrying.";

function snapshot(): {
  journal: SendJournal | null;
  error: string;
  blocked: boolean;
} {
  try {
    return { journal: readJournal(localStorage), error: "", blocked: false };
  } catch (error) {
    return { journal: null, error: errorMessage(error), blocked: true };
  }
}

export function useWalletSend(wallet: SendWallet) {
  const [state, setState] = useState(snapshot);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  const refresh = useCallback(() => setState(snapshot()), []);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === JOURNAL_KEY || event.key === null) refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  async function exclusively(operation: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try {
      if (!navigator.locks)
        throw new Error(
          "Web Locks are required to prevent duplicate requests across tabs. Use HTTPS and a supported browser.",
        );
      await navigator.locks.request(
        JOURNAL_LOCK,
        { ifAvailable: true },
        async (lock) => {
          if (!lock)
            throw new Error(
              "Another tab is handling this request. Check its result before continuing.",
            );
          await operation();
        },
      );
    } catch (error) {
      // Reread after every error, preserving intent even if no id arrived.
      setState({ ...snapshot(), error: errorMessage(error) });
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  function requireSession(journal?: SendJournal) {
    if (!wallet.connected || !wallet.address || !wallet.waitForTransaction)
      throw new Error("Connect Bread before continuing.");
    if (journal && journal.sender !== wallet.address)
      throw new Error(
        "Reconnect the original Testnet sender to check this request.",
      );
    return wallet.address;
  }

  async function checkResult(journal: SendJournal) {
    requireSession(journal);
    if (!journal.requestId || !wallet.waitForTransaction)
      throw new Error(
        "No accepted id was returned. Reconcile wallet activity; do not resend automatically.",
      );
    const result = await wallet.waitForTransaction(journal.requestId, 60_000);
    if (!result.txHash)
      throw new Error(
        "Wallet returned no result hash. Keep this request for reconciliation.",
      );
    const reported: SendJournal = {
      ...journal,
      phase: "reported",
      txHash: result.txHash,
    };
    writeJournal(localStorage, reported);
    setState({ journal: reported, error: "", blocked: false });
  }

  const send = (input: Omit<SendInput, "sender">) =>
    exclusively(async () => {
      const existing = readJournal(localStorage);
      if (existing)
        throw new Error(
          "A saved request already exists. Reconcile it before starting another.",
        );
      const sender = requireSession();
      if (!wallet.requestSend)
        throw new Error("This wallet session does not support sends.");
      const validated = validateSend({ ...input, sender });
      const journal: SendJournal = {
        ...input,
        sender,
        version: 1,
        network: "testnet",
        phase: "submitting",
      };
      writeJournal(localStorage, journal);
      setState({ journal, error: "", blocked: false });
      const requestId = await wallet.requestSend(
        new SendTransaction(
          sender,
          input.recipient,
          input.faucetId,
          "public",
          validated.amount,
        ),
      );
      if (!requestId)
        throw new Error(
          "Wallet returned no accepted id. Reconcile wallet activity before retrying.",
        );
      const accepted: SendJournal = {
        ...journal,
        phase: "accepted",
        requestId,
      };
      writeJournal(localStorage, accepted);
      setState({ journal: accepted, error: "", blocked: false });
      await checkResult(accepted);
    });

  const reconcile = () =>
    exclusively(async () => {
      const journal = readJournal(localStorage);
      if (!journal) throw new Error("No saved request to check.");
      await checkResult(journal);
    });

  const startAnother = () =>
    exclusively(async () => {
      const journal = readJournal(localStorage);
      if (!journal) return;
      requireSession(journal);
      clearCompleted(localStorage);
      refresh();
    });

  return { ...state, pending, send, reconcile, startAnother };
}
