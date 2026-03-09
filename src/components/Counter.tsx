import { useIncrementCounter } from "@/hooks/useIncrementCounter";
import { COUNTER_ADDRESS } from "@/config";
import "./Counter.css";

export function Counter() {
  const {
    increment,
    count,
    isSubmitting,
    isWaiting,
    error,
    walletConnected,
    explorerUrl,
  } = useIncrementCounter(COUNTER_ADDRESS);

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
          Counter: {COUNTER_ADDRESS}
        </a>
      </p>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
