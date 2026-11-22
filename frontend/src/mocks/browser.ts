import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";
import { mockBackend } from "./backend";

/** Start MSW and the replay before the app renders (mock mode only, loaded lazily). */
export async function startMocks() {
  const worker = setupWorker(...handlers);
  await worker.start({ onUnhandledRequest: "bypass", quiet: true });
  await mockBackend().ready;
}
