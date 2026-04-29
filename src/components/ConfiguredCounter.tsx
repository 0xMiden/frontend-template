import { useIncrementCounter } from "@/hooks/useIncrementCounter";
import "./Counter.css";

export function ConfiguredCounter({
  counterAddress,
}: {
  counterAddress: string;
}) {
  const {
    increment,
    count,
    isSubmitting,
    isWaiting,
    error,
    walletConnected,
    explorerUrl,
  } = useIncrementCounter(counterAddress);

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
        disabled={busy || count === null || !walletConnected}
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
    </div>
  );
}
