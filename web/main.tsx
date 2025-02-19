import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./app.tsx";
import { MemoryStoreProvider } from "./lib/memory.tsx";
import { DBProvider } from "./lib/db.tsx";
import { GlobalStoreProvider } from "./store.tsx";

const Providers = ({ children }: React.PropsWithChildren) => {
  return (
    <DBProvider>
      <GlobalStoreProvider>
        <MemoryStoreProvider>{children}</MemoryStoreProvider>
      </GlobalStoreProvider>
    </DBProvider>
  );
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Providers>
      <App />
    </Providers>
  </StrictMode>
);
