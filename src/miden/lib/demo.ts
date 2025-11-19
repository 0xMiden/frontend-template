import {
  WebClient,
  AccountStorageMode,
  NoteType,
  ConsumableNoteRecord,
  AccountId,
} from "@demox-labs/miden-sdk";

export async function demo() {
  // Initialize client to connect with the Miden Testnet.
  // NOTE: The client is our entry point to the Miden network.
  // All interactions with the network go through the client.
  const nodeEndpoint = "https://rpc.devnet.miden.io:443";

  // Initialize client
  const client = await WebClient.createClient(nodeEndpoint);
  await client.syncState();

  // Creating Alice's account
  const alice = await client.newWallet(AccountStorageMode.public(), true, 0);
  console.log("Alice's account ID:", alice.id().toString());

  // Creating a faucet account
  const symbol = "TEST";
  const decimals = 8;
  const initialSupply = BigInt(10_000_000 * 10 ** decimals);
  const faucet = await client.newFaucet(
    AccountStorageMode.public(), // Public: account state is visible on-chain
    false, // Mutable: account code cannot be upgraded later
    symbol, // Symbol of the token
    decimals, // Number of decimals
    initialSupply, // Initial supply of tokens
    0
  );
  console.log("Faucet account ID:", faucet.id().toString());

  // Create transaction request to mint fungible asset to Alice's account
  // NOTE: This transaction will create a P2ID note (a Miden note containing the minted asset)
  // for Alice's account. Alice will be able to consume these notes to get the fungible asset in her vault
  console.log("Minting 1000 tokens to Alice...");
  const mintTxRequest = client.newMintTransactionRequest(
    alice.id(), // Target account (who receives the tokens)
    faucet.id(), // Faucet account (who mints the tokens)
    NoteType.Public, // Note visibility (public = on-chain)
    BigInt(1000) // Amount to mint (in base units)
  );
  const mintTxId = await client.submitNewTransaction(
    faucet.id(),
    mintTxRequest
  );

  console.log("Mint transaction submitted successfully, ID:", mintTxId.toHex());

  await client.syncState();

  let consumableNotes: ConsumableNoteRecord[] = [];
  while (consumableNotes.length === 0) {
    // Find consumable notes
    consumableNotes = await client.getConsumableNotes(alice.id());

    console.log("Waiting for note to be consumable...");
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  const noteIds = consumableNotes.map((note) =>
    note.inputNoteRecord().id().toString()
  );

  // Create transaction request to consume notes
  // NOTE: This transaction will consume the notes and add the fungible asset to Alice's vault
  const consumeTxRequest = client.newConsumeTransactionRequest(noteIds);
  const consumeTxId = await client.submitNewTransaction(
    alice.id(),
    consumeTxRequest
  );
  console.log(
    "Consume transaction submitted successfully, ID:",
    consumeTxId.toHex()
  );

  console.log(
    "Alice's TEST token balance:",
    Number(alice.vault().getBalance(faucet.id()))
  );

  await client.syncState();

  // Send tokens from Alice to Bob
  const bobAccountId = "0x599a54603f0cf9000000ed7a11e379";
  console.log("Sending 100 tokens to Bob...");

  // Build transaction request to send tokens from Alice to Bob
  const sendTxRequest = client.newSendTransactionRequest(
    alice.id(), // Sender account
    AccountId.fromHex(bobAccountId), // Recipient account
    faucet.id(), // Asset ID (faucet that created the tokens)
    NoteType.Public, // Note visibility
    BigInt(100) // Amount to send
  );

  const sendTxId = await client.submitNewTransaction(alice.id(), sendTxRequest);
  console.log("Send transaction submitted successfully, ID:", sendTxId.toHex());

  await client.syncState();
}
