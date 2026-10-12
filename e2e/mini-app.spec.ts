import { expect, test } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import { createP2IDNote } from "@miden-sdk/miden-sdk";

const sender = "mtst1arqxg9er3xclayt95nud82jnpggl9azj";
const faucetId = "mtst1aqvpq8a9ytqhfvt9al20wzsrs56g83ec";
const otherSender = "mtst1arqxg9er3xclayt95nud82jnpv848mdg_qr7qqq9wr6w";
const journalKey = "miden-mini-app:send:v1";

// Real SDK serialization -> browser adapter Note.deserialize. No client, RPC or keys.
const note = createP2IDNote({
  from: sender,
  to: sender,
  assets: { token: faucetId, amount: 10n },
  type: "public",
});
const serializedNote = Buffer.from(note.serialize()).toString("base64");
note.free?.();

interface Probe {
  address: string;
  sends: number;
  waits: string[];
  connectPolicy?: unknown[];
  intent?: unknown;
  payload?: unknown;
}
declare global {
  interface Window {
    miniAppProbe: Probe;
  }
}

async function injectWallet(
  context: BrowserContext,
  mode: "success" | "timeout" | "no-id" | "decline" = "success",
) {
  await context.addInitScript(
    ({ sender, serializedNote, mode, journalKey }) => {
      const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
      const probe: Probe = (window.miniAppProbe = {
        address: sender,
        sends: 0,
        waits: [],
      });
      // Delay injection to exercise readiness detection after initial page evaluation.
      setTimeout(() => {
        const provider = {
          address: "",
          publicKey: new Uint8Array(32),
          on(event: string, listener: (...args: unknown[]) => void) {
            const group = listeners.get(event) ?? new Set();
            group.add(listener);
            listeners.set(event, group);
          },
          off(event: string, listener: (...args: unknown[]) => void) {
            listeners.get(event)?.delete(listener);
          },
          async connect(...policy: unknown[]) {
            probe.connectPolicy = policy;
            if (mode === "decline")
              throw new Error("Connection declined by fixture");
            this.address = probe.address;
          },
          async disconnect() {
            this.address = "";
          },
          async requestSend(payload: unknown) {
            probe.sends++;
            probe.intent = JSON.parse(localStorage.getItem(journalKey)!);
            probe.payload = payload;
            // Hold long enough to attempt a competing send from a second tab.
            await new Promise((resolve) => setTimeout(resolve, 250));
            return mode === "no-id"
              ? {}
              : { transactionId: "fixture-accepted-1" };
          },
          async waitForTransaction(id: string) {
            probe.waits.push(id);
            if (mode === "timeout" && probe.sends > 0)
              throw new Error("Fixture result timeout");
            return {
              txHash: "fixture-result-2",
              outputNotes: [serializedNote],
            };
          },
        };
        Object.assign(window, { midenWallet: provider });
      }, 600);
    },
    { sender, serializedNote, mode, journalKey },
  );
}

async function connect(page: Page) {
  await page.goto("/mini-app.html");
  await expect(
    page.getByRole("heading", { name: "Send with Bread" }),
  ).toBeVisible();
  const choose = page.getByRole("button", { name: "Choose Bread" });
  if (await choose.count()) {
    await expect(choose).toBeEnabled();
    await choose.click();
  }
  await page
    .getByRole("button", { name: "Connect Bread", exact: true })
    .click();
  await expect(page.getByText("Connected Testnet sender:")).toBeVisible();
}

async function fillSend(page: Page) {
  await page.getByLabel("Recipient Testnet address").fill(sender);
  await page.getByLabel("Token faucet Testnet address").fill(faucetId);
  await page.getByLabel("Amount in token base units").fill("10");
}

test("ordinary browser renders without a provider or local client", async ({
  page,
}) => {
  const errors: string[] = [];
  const remoteRequests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4179/"))
      remoteRequests.push(request.url());
  });
  await page.goto("/mini-app.html");
  await expect(
    page.getByRole("heading", { name: "Send with Bread" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Choose Bread" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Request public send" }),
  ).toBeDisabled();
  expect(await page.evaluate(() => indexedDB.databases())).toEqual([]);
  expect(remoteRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test("released adapter sends the validated payload and decodes a real v0.17 output note", async ({
  context,
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await injectWallet(context);
  await connect(page);
  await fillSend(page);
  await page.getByRole("button", { name: "Request public send" }).click();
  await expect(page.getByText(/Wallet reported result:/)).toContainText(
    "fixture-result-2",
  );
  expect(await page.evaluate(() => window.miniAppProbe)).toMatchObject({
    sends: 1,
    waits: ["fixture-accepted-1"],
    connectPolicy: ["UPON_REQUEST", "testnet", 0],
    intent: { phase: "submitting", sender, network: "testnet", amount: "10" },
    payload: {
      senderAddress: sender,
      recipientAddress: sender,
      faucetId,
      noteType: "public",
      amount: 10,
    },
  });
  await expect(
    page.getByRole("button", { name: "Request public send" }),
  ).toBeDisabled();
  expect(await page.evaluate(() => indexedDB.databases())).toEqual([]);
  expect(errors).toEqual([]);
});

test("reload resumes an accepted id and a changed sender cannot check it", async ({
  context,
  page,
}) => {
  await injectWallet(context, "timeout");
  await connect(page);
  await fillSend(page);
  await page.getByRole("button", { name: "Request public send" }).click();
  await expect(
    page.getByText("Fixture result timeout", { exact: true }).first(),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Connect Bread", exact: true })
    .click();
  await page.evaluate((other) => {
    window.miniAppProbe.address = other;
  }, otherSender);
  await page.getByRole("button", { name: "Refresh connection" }).click();
  await expect(
    page.getByRole("button", { name: "Check accepted request" }),
  ).toBeDisabled();
  await expect(page.getByLabel("Recipient Testnet address")).toHaveValue("");
  await page.evaluate((original) => {
    window.miniAppProbe.address = original;
  }, sender);
  await page.getByRole("button", { name: "Refresh connection" }).click();
  await page.getByRole("button", { name: "Check accepted request" }).click();
  await expect(page.getByText(/Wallet reported result:/)).toBeVisible();
  expect(await page.evaluate(() => window.miniAppProbe)).toMatchObject({
    sends: 0,
    waits: ["fixture-accepted-1"],
  });
});

test("missing accepted id stays blocked across reload", async ({
  context,
  page,
}) => {
  await injectWallet(context, "no-id");
  await connect(page);
  await fillSend(page);
  await page.getByRole("button", { name: "Request public send" }).click();
  await expect(page.getByText(/No accepted ID was saved/)).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Connect Bread", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Request public send" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Check accepted request" }),
  ).toBeDisabled();
  expect(await page.evaluate(() => window.miniAppProbe.sends)).toBe(0);
});

test("two tabs dispatch only one unresolved send", async ({
  context,
  page,
}) => {
  await injectWallet(context, "timeout");
  await connect(page);
  await fillSend(page);
  const second = await context.newPage();
  await connect(second);
  await fillSend(second);
  // DOM click in the same task avoids auto-waiting on the storage event's disabled state.
  await Promise.all(
    [page, second].map((p) =>
      p
        .getByRole("button", { name: "Request public send" })
        .evaluate((button) => (button as HTMLButtonElement).click()),
    ),
  );
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.miniAppProbe.sends)) +
        (await second.evaluate(() => window.miniAppProbe.sends)),
    )
    .toBe(1);
  await expect(
    page.getByRole("button", { name: "Request public send" }),
  ).toBeDisabled();
  await expect(
    second.getByRole("button", { name: "Request public send" }),
  ).toBeDisabled();
});

test("connection refusal is visible without an authorized send", async ({
  context,
  page,
}) => {
  await injectWallet(context, "decline");
  await page.goto("/mini-app.html");
  await expect(
    page.getByRole("button", { name: "Choose Bread" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Choose Bread" }).click();
  await page
    .getByRole("button", { name: "Connect Bread", exact: true })
    .click();
  await expect(
    page.getByText("Connection declined by fixture", { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.miniAppProbe.sends)).toBe(0);
});

test("corrupt journal fields block dispatch without crashing or discarding the record", async ({ context, page }) => {
  const record = JSON.stringify({ version: 1, network: "testnet", phase: "submitting", sender, recipient: sender, faucetId, amount: "10", requestId: { invalid: "object" } });
  await context.addInitScript(({ key, record }) => localStorage.setItem(key, record), { key: journalKey, record });
  await injectWallet(context);
  await connect(page);
  await expect(page.getByText(/Stored request journal is invalid/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Request public send" })).toBeDisabled();
  expect(await page.evaluate(key => localStorage.getItem(key), journalKey)).toBe(record);
  expect(await page.evaluate(() => window.miniAppProbe.sends)).toBe(0);
});

test("mobile viewport stays readable and within the screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/mini-app.html");
  await expect(
    page.getByRole("heading", { name: "Send with Bread" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
  await page.screenshot({ path: test.info().outputPath("mobile.png"), fullPage: true });
});
