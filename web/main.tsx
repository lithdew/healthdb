import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./app.tsx";
import { MemoryStoreProvider } from "./lib/memory.tsx";
import { DBProvider } from "./lib/db.tsx";
import { StoreProvider } from "./store/index.tsx";

const Providers = ({ children }: React.PropsWithChildren) => {
  return (
    <DBProvider>
      <StoreProvider>
        <MemoryStoreProvider>{children}</MemoryStoreProvider>
      </StoreProvider>
    </DBProvider>
  );
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Providers>
      <App />
    </Providers>
  </StrictMode>,
);
