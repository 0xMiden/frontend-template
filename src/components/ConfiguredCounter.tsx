import { useIncrementCounter } from "@/hooks/useIncrementCounter";
import "./Counter.css";

export function ConfiguredCounter({
  counterAddress,
}: {
  counterAddress: string;
}) {
  const {
    increment,
    incrementBlockedReason,
    count,
    isSubmitting,
    isWaiting,
    error,
    walletConnected,
    explorerUrl,
  } = useIncrementCounter(counterAddress);

  // The write path can be blocked independently of the read path (currently on
  // Miden SDK v0.15 — see config `INCREMENT_ONCHAIN_BLOCKED`). When blocked we keep
  // showing the read value but disable the button and explain why, rather than
  // letting the user click into a guaranteed-failing, fee-bearing transaction.
  const blocked = incrementBlockedReason !== null;
  const busy = isSubmitting || isWaiting;
  const buttonLabel = isSubmitting
    ? "Submitting..."
    : isWaiting
      ? "Waiting for network..."
      : `count is ${count ?? "..."}`;

  return (
    <div className="card">
      <button
        className="counter-button"
        onClick={increment}
        disabled={blocked || busy || count === null || !walletConnected}
        title={incrementBlockedReason ?? undefined}
      >
        {buttonLabel}
      </button>
      <p>
        <a
          href={explorerUrl}
          target="_blank"
          rel="noreferrer"
          className="account-id"
        >
          Counter: {counterAddress}
        </a>
      </p>
      {error && <p className="error">{error}</p>}
      {blocked && (
        <p className="error" role="note">
          {incrementBlockedReason}
        </p>
      )}
    </div>
  );
}
