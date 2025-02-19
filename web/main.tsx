import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./app.tsx";
import { MemoryStoreProvider } from "./lib/memory.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MemoryStoreProvider>
      <App />
    </MemoryStoreProvider>
  </StrictMode>,
);
