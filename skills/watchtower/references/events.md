# `@cotera/watchtower-events` — event-driven watchables

The seam between a push stream (WebSocket, SSE) and a watchable. Take this
package only when the app has such a stream; a value derived from other values
needs none of it.

Peers: `react`, `jotai`. Depends on `@cotera/watchtower`.

## The event bus

The library never produces events — your transport does.

```ts
import { emit, setConnectionStatus } from '@cotera/watchtower-events';

socket.onmessage = (msg) => emit(msg.type, msg.payload);
socket.onopen = () => setConnectionStatus(true);
socket.onclose = () => setConnectionStatus(false);
```

Full surface:

```ts
emit(event: string, payload?: unknown): void
subscribe(event: string, listener: (payload?: unknown) => void): () => void
setConnectionStatus(connected: boolean): void
getConnectionStatus(): boolean
subscribeToConnectionStatus(cb: (connected: boolean) => void): () => void
resetEventBus(): void      // drops all listeners, resets state — for tests
```

**Both socket handlers matter.** Connection status is not bookkeeping — it is
what drives `fallback` polling. A watchable with a fallback polls only while the
stream is reported *down*. Wire `onopen` and you get no permanent polling; forget
`onclose` and the fallback never engages.

`setConnectionStatus` no-ops when the state is unchanged, so calling it on every
frame is harmless. `subscribeToConnectionStatus` fires immediately with the
current state, so a subscriber never waits for the next transition. Initial
state is `false` (disconnected).

## `EventWatchable`

Refetches when a named event arrives. The workhorse for data kept live by a
socket.

```ts
const runs = EventWatchable.for({
  events: ['run.started', 'run.finished'],
  initialValue: [],
  fn: async (payload, get) => fetchRuns(get(filters)),
  reconcile: { cadence: 30_000 },
  fallback: { fn: async () => fetchRuns(), interval: 3_000 },
  debounceMs: 100,
  serializeRefreshes: true,
});

await runs.refresh();   // manual, payload-free
runs.unsubscribe();     // releases event + connection + all timers
```

Returns `ReadonlyEventWatchable<T>` — `ReadonlyWatchable<T>` plus
`refresh(payload?)` and `unsubscribe()`.

### `fn`

```ts
fn: (payload: P | undefined, get: WatchableGetter) => Promise<T>
```

`payload` is the event payload when an event triggered the refresh, and
`undefined` on mount, on reconcile ticks, and on a bare `refresh()`. **That
distinction is load-bearing** — it is how `QueryClientEventWatchable` decides
whether to invalidate, and the idiomatic way to branch between "apply this
delta" and "resync everything".

`get` reads other watchables, like `Watchable.from`. Note it reads via
`snapshot()`, so it is a point-in-time read — it does **not** establish a
reactive dependency. A change in the read watchable will not trigger a refresh;
only events, reconcile, fallback, and manual `refresh()` do.

Stale responses from superseded refreshes are dropped by generation counter, so
a slow fetch can never overwrite a newer one.

### Options, one per failure mode

| Option | Handles |
| --- | --- |
| `event` / `events` | which event names to listen on — one of the two is required, or the constructor throws |
| `fallback: { fn, interval? }` | the stream is down — poll instead (default 3000ms), until it is back |
| `reconcile: { cadence }` | an event was missed — re-fetch `fn(undefined)` on a cadence to converge |
| `debounceMs` | events arrive in bursts — coalesce to one trailing refresh |
| `serializeRefreshes` | refreshes overlap — run one at a time, queue the latest |
| `serializeQueueStrategy` | `'latest'` (default) or `'discard'` for that queue |
| `filter: (payload) => boolean` | the event is not about this value — ignore it |
| `equalityFn` | the new value equals the old — skip the write, skip the render |
| `runOnMount` | defaults true; set false to stay at `initialValue` until an event |
| `subscribe` | supply a different transport instead of the process-wide bus |
| `subscribeToConnectionStatus` | ditto, for connection state |

The last two are how a test — or a second, independent stream — bypasses the
global bus without touching it.

### Lifecycle

`unsubscribe()` is not optional for anything with `fallback`, `reconcile`, or
`debounceMs`: each owns a timer that outlives the component otherwise. A
module-level `EventWatchable` never needs it; one created per mounted view
always does.

## `TwoWayEventWatchable`

An `EventWatchable` that also writes, with rollback.

```ts
const title = TwoWayEventWatchable.for({
  event: 'doc.updated',
  initialValue: '',
  fn: async () => fetchTitle(),
  persist: async (value) => saveTitle(value),
});

await title.setOptimistic('New title');
```

`setOptimistic` applies the value immediately, then awaits `persist`. If
`persist` throws it restores the previous value and rethrows
`Error('Persist failed, rolled back')` — so the original error is lost. Log it
inside `persist` if you need the detail.

Every `EventWatchable` option applies. The returned type has `setOptimistic`,
`refresh`, `unsubscribe`, and the readonly surface — but no plain `set`.

## Choosing between this and polling

`PollingWatchable` when the server has no way to tell you. `EventWatchable` with
a `fallback` when it usually does but the socket can drop. Do not run both for
one value — the fallback *is* the polling, gated on connection state.
