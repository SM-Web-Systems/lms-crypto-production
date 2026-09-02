// packages/chrome-extension/src/popup/main.tsx
import "../shared/i18n";          // MUST be first import
import { Buffer } from "buffer";
globalThis.Buffer = Buffer;

import React from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import App from "./App";
import "../index.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 2 } },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <App />
        <Toaster theme="dark" position="bottom-right" richColors />
      </MemoryRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
