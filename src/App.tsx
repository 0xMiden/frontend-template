import { useState } from "react";
import reactLogo from "./assets/react.svg";
import midenLogo from "./assets/miden.svg";
import viteLogo from "/vite.svg";
import "./App.css";
import { demo } from "./miden/lib/demo";

function App() {
  const [count, setCount] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<string>("");

  const handleDemoClick = async () => {
    setIsRunning(true);
    setResult("");
    try {
      await demo();
      setResult("Demo executed successfully! Check console for output.");
    } catch (error) {
      setResult(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
        <a href="https://docs.miden.xyz" target="_blank">
          <img src={midenLogo} className="logo miden" alt="Miden logo" />
        </a>
      </div>
      <h1>Vite + React + Miden</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <div className="card">
        <button onClick={handleDemoClick} disabled={isRunning}>
          {isRunning ? "Running Demo..." : "Run Miden Demo"}
        </button>
        {result && <p style={{ marginTop: "1rem" }}>{result}</p>}
      </div>
      <p className="read-the-docs">
        Click on the Vite, React, and Miden logos to learn more
      </p>
    </>
  );
}

export default App;
