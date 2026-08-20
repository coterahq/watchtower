/**
 * Event-driven watchables for WatchTower.
 *
 * A `Watchable` refreshes when something tells it to. This package supplies the
 * "something": a process-wide event bus that your transport — a WebSocket, an
 * SSE stream — pushes frames into, and the watchables that listen on it.
 *
 * It ships separately from `@cotera/watchtower` because a value derived from
 * other values needs none of this. Take it when you have a push stream to wire
 * up, leave it when you don't.
 */
export * from './event-watchable';
export {
  emit,
  subscribe,
  setConnectionStatus,
  getConnectionStatus,
  subscribeToConnectionStatus,
  resetEventBus,
} from './event-bus';
