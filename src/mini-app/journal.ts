import { AccountId } from "@miden-sdk/miden-sdk";

export const JOURNAL_KEY = "miden-mini-app:send:v1";
export const JOURNAL_LOCK = `${JOURNAL_KEY}:lock`;

export interface SendInput {
  sender: string;
  recipient: string;
  faucetId: string;
  amount: string;
}

export interface SendJournal extends SendInput {
  version: 1;
  network: "testnet";
  phase: "submitting" | "accepted" | "reported";
  requestId?: string;
  txHash?: string;
}

type JournalStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

// Use the installed SDK's decoder, without creating a client, database or key.
// Testnet bech32 only: raw hex does not encode a network.
function validateAddress(value: string) {
  if (!value.startsWith("mtst1"))
    throw new Error("Use a Testnet bech32 address (mtst1…).");
  try {
    const id = AccountId.fromBech32(value);
    id.free?.(); // Browser WASM uses explicit free; Node's native binding uses GC.
  } catch {
    throw new Error("Invalid Testnet account address or checksum.");
  }
}

export function validateSend(input: SendInput) {
  for (const id of [input.sender, input.recipient, input.faucetId])
    validateAddress(id);
  if (
    !/^[1-9]\d*$/.test(input.amount) ||
    !Number.isSafeInteger(Number(input.amount))
  ) {
    throw new Error("Enter a positive safe integer in token base units.");
  }
  return { ...input, amount: Number(input.amount) };
}

export function readJournal(storage: JournalStorage): SendJournal | null {
  const raw = storage.getItem(JOURNAL_KEY);
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") throw new Error();
    const j = value as Partial<SendJournal>;
    if (
      j.version !== 1 ||
      j.network !== "testnet" ||
      typeof j.sender !== "string" ||
      typeof j.recipient !== "string" ||
      typeof j.faucetId !== "string" ||
      typeof j.amount !== "string" ||
      !["submitting", "accepted", "reported"].includes(j.phase ?? "") ||
      (j.requestId !== undefined && (typeof j.requestId !== "string" || !j.requestId)) ||
      (j.txHash !== undefined && (typeof j.txHash !== "string" || !j.txHash)) ||
      (j.phase !== "submitting" &&
        (typeof j.requestId !== "string" || !j.requestId)) ||
      (j.phase === "reported" && (typeof j.txHash !== "string" || !j.txHash))
    )
      throw new Error();
    validateSend(j as SendInput);
    return j as SendJournal;
  } catch {
    throw new Error(
      "Stored request journal is invalid. Preserve it and reconcile wallet activity before changing it.",
    );
  }
}

export function writeJournal(storage: JournalStorage, journal: SendJournal) {
  // Storage errors propagate. Never dispatch a request whose intent cannot be saved.
  storage.setItem(JOURNAL_KEY, JSON.stringify(journal));
}

export function clearCompleted(storage: JournalStorage) {
  if (readJournal(storage)?.phase !== "reported")
    throw new Error("Cannot clear an unresolved request.");
  storage.removeItem(JOURNAL_KEY);
}
