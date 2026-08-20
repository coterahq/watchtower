/**
 * Process-wide event bus that {@link EventWatchable} listens on by default.
 *
 * The library never produces events itself — something in the application has to
 * {@link emit} them, typically the handler for a WebSocket or SSE stream, and
 * report the health of that stream through {@link setConnectionStatus} so
 * watchables configured with a `fallback` know when to start polling.
 *
 * Every `EventWatchable` option that reads from here (`subscribe`,
 * `subscribeToConnectionStatus`) can be overridden per watchable, so a test — or
 * a second, independent stream — can supply its own transport instead.
 */
type Listener = (payload?: unknown) => void;
type ConnectionStatusListener = (connected: boolean) => void;

const listenersByEvent = new Map<string, Set<Listener>>();
const connectionStatusListeners = new Set<ConnectionStatusListener>();
let isConnected = false;

/**
 * Reports whether the push stream backing these events is up. Watchables with a
 * `fallback` poll while this is false and stop as soon as it flips back to true,
 * so call it from both the open and close handlers of the underlying transport.
 */
export function setConnectionStatus(connected: boolean): void {
  if (isConnected === connected) {
    return;
  }
  isConnected = connected;
  for (const cb of connectionStatusListeners) {
    cb(connected);
  }
}

/** Current connection state, as last reported to {@link setConnectionStatus}. */
export function getConnectionStatus(): boolean {
  return isConnected;
}

/**
 * Subscribes to connection-state changes. The callback fires immediately with
 * the current state, so a subscriber never has to wait for the next transition
 * to learn where things stand.
 */
export function subscribeToConnectionStatus(
  cb: ConnectionStatusListener
): () => void {
  connectionStatusListeners.add(cb);
  cb(isConnected);
  return () => {
    connectionStatusListeners.delete(cb);
  };
}

/** Subscribes to one event name. Returns the unsubscribe function. */
export function subscribe(event: string, listener: Listener): () => void {
  let set = listenersByEvent.get(event);
  if (set === undefined) {
    set = new Set();
    listenersByEvent.set(event, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
  };
}

/** Delivers an event to every current subscriber of that name. */
export function emit(event: string, payload?: unknown): void {
  const set = listenersByEvent.get(event);
  if (set === undefined) {
    return;
  }
  for (const listener of set) {
    listener(payload);
  }
}

/** Drops every listener and resets connection state. Intended for tests. */
export function resetEventBus(): void {
  listenersByEvent.clear();
  connectionStatusListeners.clear();
  isConnected = false;
}
