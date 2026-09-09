import type { useMiden, useMidenClient, useConsume, useWaitForCommit } from "@miden-sdk/react";
import { Endpoint, RpcClient, NoteScript } from "@miden-sdk/miden-sdk";
import { parseAccountId } from "./miden";
import { MIDEN_FAUCET_URL, MIDEN_RPC_URL, NETWORK_POLL_INTERVAL_MS, NETWORK_POLL_TIMEOUT_MS } from "@/config";

const pollOptions = { intervalMs: NETWORK_POLL_INTERVAL_MS, timeoutMs: NETWORK_POLL_TIMEOUT_MS };
const sleep = () => new Promise((resolve) => setTimeout(resolve, pollOptions.intervalMs));
type FundingOptions = {
  client: ReturnType<typeof useMidenClient>;
  runExclusive: ReturnType<typeof useMiden>["runExclusive"];
  consume: ReturnType<typeof useConsume>["consume"];
  waitForCommit: ReturnType<typeof useWaitForCommit>["waitForCommit"];
  onStatus: (status: string) => void;
};

/** Temporary funding helper: replace this call when the SDK provides account funding. */
export async function fundAccounts(
  accounts: { id: string; label: string }[],
  { client, runExclusive, consume, waitForCommit, onStatus }: FundingOptions,
): Promise<void> {
  // Mutations own their locks; rc.7's waitForCommit and direct client calls do not.
  const committed = (txId: string) => runExclusive(() => waitForCommit(txId, pollOptions));
  const readSetting = (key: string) => runExclusive(async () => {
    const bytes = await client.getSetting(key) as number[] | undefined;
    return bytes ? new TextDecoder().decode(Uint8Array.from(bytes)) : undefined;
  });
  const writeSetting = (key: string, value: string) => runExclusive(() =>
    client.setSetting(key, Array.from(new TextEncoder().encode(value))));
  const endpoint = MIDEN_RPC_URL === "testnet" ? Endpoint.testnet()
    : MIDEN_RPC_URL === "devnet" ? Endpoint.devnet()
    : MIDEN_RPC_URL === "localhost" ? Endpoint.localhost() : new Endpoint(MIDEN_RPC_URL);
  const rpc = new RpcClient(endpoint);
  let feeAsset: string;
  let reserve: bigint;
  try {
    const header = await rpc.getBlockHeaderByNumber();
    feeAsset = header.feeFaucetId().toString();
    reserve = BigInt(header.verificationBaseFee()) * 256n; // Demo reserve for several transactions.
  } finally { rpc.free(); }

  if (reserve === 0n) return;
  for (const { id, label } of accounts) {
    const balance = () => runExclusive(async () => {
      await client.syncState();
      const account = await client.getAccount(parseAccountId(id));
      if (!account) throw new Error(`Cannot fund missing account: ${id}`);
      return account.vault().getBalance(parseAccountId(feeAsset));
    });
    const key = `counter:funding:${id}`;
    let fundingNote = await readSetting(key);
    // Settle a known note before trusting the SDK's locally applied balance.
    if (!fundingNote && await balance() >= reserve) continue;
    const findFunding = () => runExclusive(async () => {
      await client.syncState();
      const notes = await client.getConsumableNotes(parseAccountId(id));
      const p2id = NoteScript.p2id().root().toHex();
      return notes.map((record) => record.inputNoteRecord().toNote()).find((note) =>
        note.script().root().toHex() === p2id && note.assets().fungibleAssets().some((asset) =>
          asset.faucetId().toString() === feeAsset && asset.amount() > 0n))?.id().toString();
    });
    if (!fundingNote) {
      // A previous HTTP request may have minted a note without returning its ID.
      fundingNote = await findFunding();
      if (!fundingNote) {
        if (!MIDEN_FAUCET_URL) throw new Error("Configure VITE_MIDEN_FAUCET_URL to fund transaction fees.");
        onStatus(`Requesting ${label} funding...`);
        try {
          fundingNote = await requestFaucetTokens(MIDEN_FAUCET_URL, id, (faucetId) => {
            if (parseAccountId(faucetId).toString() !== feeAsset) {
              throw new Error("Configured faucet does not mint this network's fee asset.");
            }
          });
        } catch (err) {
          fundingNote = await findFunding();
          if (!fundingNote) throw err;
        }
      }
      await writeSetting(key, fundingNote);
    }
    onStatus(`Receiving ${label} funding...`);
    const deadline = Date.now() + pollOptions.timeoutMs;
    let received = false;
    while (!received && Date.now() < deadline) {
      const record = await runExclusive(async () => {
        await client.syncState();
        return client.getInputNote(fundingNote!);
      });
      if (record?.isConsumed()) { received = true; break; }
      let txId = record?.consumerTransactionId();
      if (!txId && record?.inclusionProof() && !record.isProcessing()) {
        txId = (await consume({ accountId: id, notes: [fundingNote] })).transactionId;
      }
      if (txId) {
        onStatus(`Confirming ${label} funding...`);
        await committed(txId);
        received = true;
      } else { await sleep(); }
    }
    if (!received) throw new Error(`Funding note for ${label} has not committed yet. Try again later.`);
    const fundedBalance = await balance();
    await runExclusive(() => client.removeSetting(key));
    if (fundedBalance < reserve) {
      throw new Error(`Insufficient fee balance for ${label} after funding: ${fundedBalance}, need ${reserve}.`);
    }
  }
}

/** Request a public funding note over HTTP; the recipient must still consume it.
 * Unlike useMint, this does not execute the faucet account. PoW is SHA-256(challenge || nonce_be).
 */
export async function requestFaucetTokens(
  baseUrl: string,
  accountId: string,
  validateFaucet: (id: string) => void,
): Promise<string> {
  const get = async (path: string, params?: URLSearchParams) => {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/${path}${params ? `?${params}` : ""}`, {
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Faucet ${path}: HTTP ${response.status} ${await response.text()}`);
    return response.json();
  };
  const metadata = await get("get_metadata");
  validateFaucet(metadata.id);
  const amount = String(metadata.base_amount);
  if (!/^\d+$/.test(amount) || BigInt(amount) <= 0n) {
    throw new Error("Faucet returned an invalid token amount.");
  }
  const pow = await get("pow", new URLSearchParams({ account_id: accountId, amount }));
  const hex = String(pow.challenge).replace(/^0x/, "");
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(hex)) throw new Error("Invalid faucet challenge.");
  const challenge = Uint8Array.from(hex.match(/../g)!, (byte) => parseInt(byte, 16));
  const input = new Uint8Array(challenge.length + 8);
  input.set(challenge);
  const view = new DataView(input.buffer);
  const target = BigInt(pow.target);
  if (target <= 0n || target > 1n << 64n) throw new Error("Invalid faucet PoW target.");
  let nonce = new DataView(crypto.getRandomValues(new Uint8Array(8)).buffer).getBigUint64(0);
  const deadline = Date.now() + 90_000;
  for (;;) {
    view.setBigUint64(challenge.length, nonce);
    const digest = new DataView(await crypto.subtle.digest("SHA-256", input));
    if (digest.getBigUint64(0) < target) break;
    if (Date.now() >= deadline) throw new Error("Faucet proof of work timed out. Try again.");
    nonce = BigInt.asUintN(64, nonce + 1n);
  }
  const result = await get("get_tokens", new URLSearchParams({
    account_id: accountId,
    is_private_note: "false",
    asset_amount: amount,
    challenge: pow.challenge,
    nonce: String(nonce),
  }));
  if (typeof result.note_id !== "string" || !/^0x[0-9a-f]{64}$/i.test(result.note_id)) {
    throw new Error("Faucet did not return a valid funding note ID.");
  }
  return result.note_id;
}
