import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ApiError } from "@/api/client";
import { isMock } from "@/lib/env";
import { router } from "@/app/router";
import { DevSettings } from "@/app/DevSettings";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 2,
    },
  },
});

async function start() {
  if (isMock) await (await import("@/mocks/browser")).startMocks();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <Tooltip.Provider>
          <RouterProvider router={router} future={{ v7_startTransition: true }} />
          <DevSettings />
        </Tooltip.Provider>
      </QueryClientProvider>
    </StrictMode>,
  );
}
void start();
