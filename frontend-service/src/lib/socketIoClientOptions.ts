/**
 * Shared Socket.IO client options for chat and calls.
 * Polling first, then WebSocket upgrade, survives slow first paint and some proxies
 * better than `transports: ['websocket']` alone (fewer “interrupted while loading” drops).
 */
export function createSocketIoClientOptions(auth?: Record<string, string | undefined>) {
  return {
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 800,
    reconnectionDelayMax: 15000,
    randomizationFactor: 0.5,
    timeout: 25000,
    transports: ["polling", "websocket"],
    ...(auth ? { auth } : {}),
  };
}

/** Wait until DOM is past the initial parsing phase before opening sockets (reduces races with late CSS/fonts). */
export function waitForDomReady(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (document.readyState !== "loading") return Promise.resolve();
  return new Promise((resolve) => {
    document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
  });
}
