import { beforeEach, describe, expect, it } from "vitest";
import {
  JOURNAL_KEY,
  readJournal,
  writeJournal,
  clearCompleted,
  validateSend,
} from "../journal";

const sender = "mtst1arqxg9er3xclayt95nud82jnpggl9azj";
const recipient = "mtst1arqxg9er3xclayt95nud82jnpggl9azj";
const faucetId = "mtst1aqvpq8a9ytqhfvt9al20wzsrs56g83ec";
const intent = {
  version: 1 as const,
  network: "testnet" as const,
  sender,
  recipient,
  faucetId,
  amount: "10",
  phase: "submitting" as const,
};

describe("mini-app request journal", () => {
  beforeEach(() => localStorage.clear());

  it("restores the intent written before dispatch even without a request id", () => {
    writeJournal(localStorage, intent);
    expect(readJournal(localStorage)).toEqual(intent);
  });

  it("restores an accepted id separately from the wallet result hash", () => {
    writeJournal(localStorage, {
      ...intent,
      phase: "reported",
      requestId: "request-1",
      txHash: "hash-2",
    });
    expect(readJournal(localStorage)).toMatchObject({
      requestId: "request-1",
      txHash: "hash-2",
    });
    clearCompleted(localStorage);
    expect(readJournal(localStorage)).toBeNull();
  });

  it("refuses to clear an unresolved intent or accepted request", () => {
    writeJournal(localStorage, intent);
    expect(() => clearCompleted(localStorage)).toThrow(/unresolved/i);
    writeJournal(localStorage, {
      ...intent,
      phase: "accepted",
      requestId: "request-1",
    });
    expect(() => clearCompleted(localStorage)).toThrow(/unresolved/i);
  });

  it.each([
    "{",
    "null",
    '{"version":2}',
    JSON.stringify({ ...intent, phase: "reported" }),
    JSON.stringify({ ...intent, phase: "accepted" }),
    JSON.stringify({ ...intent, amount: "9007199254740992" }),
  ])("blocks malformed or incompatible stored data: %s", (raw) => {
    localStorage.setItem(JOURNAL_KEY, raw);
    expect(() => readJournal(localStorage)).toThrow(/journal/i);
    expect(localStorage.getItem(JOURNAL_KEY)).toBe(raw);
  });

  it.each(["0", "-1", "1.2", "1e3", "9007199254740992", "", " 1 "])(
    "rejects non-positive or imprecise base units: %s",
    (amount) => {
      expect(() =>
        validateSend({ sender, recipient, faucetId, amount }),
      ).toThrow(/base units/i);
    },
  );

  it("keeps the largest safe integer exact", () => {
    expect(
      validateSend({ sender, recipient, faucetId, amount: "9007199254740991" })
        .amount,
    ).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("rejects a wrong-network address and malformed bech32 checksum", () => {
    expect(() =>
      validateSend({
        sender,
        recipient: recipient.replace("mtst", "mdev"),
        faucetId,
        amount: "1",
      }),
    ).toThrow(/Testnet/i);
    expect(() =>
      validateSend({
        sender,
        recipient: "mtst1invalid",
        faucetId,
        amount: "1",
      }),
    ).toThrow(/address/i);
  });
});
