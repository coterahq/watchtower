# @cotera/watchtower-events

Event-driven watchables for [`@cotera/watchtower`](../watchtower) — a
process-wide event bus, and the watchables that refresh from it.

A plain `Watchable` recomputes when the values it derives from change. That is
enough for state the app owns, and not enough for state the *server* owns: a run
that finishes, a document someone else edits, a job that changes status. Those
arrive as frames on a WebSocket or an SSE stream. This package is the seam
between that stream and a watchable.

It ships separately because a value derived from other values needs none of it.

```bash
bun add @cotera/watchtower-events
# peers
bun add jotai react
```

## The event bus

The library never produces events itself — your transport does. Push frames in
with `emit`, and report the health of the stream with `setConnectionStatus`:

```ts
import { emit, setConnectionStatus } from '@cotera/watchtower-events';

socket.onmessage = (msg) => emit(msg.type, msg.payload);
socket.onopen = () => setConnectionStatus(true);
socket.onclose = () => setConnectionStatus(false);
```

Connection status is not bookkeeping — it is what drives `fallback` polling
below. A watchable with a fallback polls only while the stream is reported down,
so both handlers matter.

`resetEventBus()` drops every listener and resets connection state, for tests.

## `EventWatchable`

Refetches when a named event arrives. This is the workhorse for data kept live
by a WebSocket.

```ts
import { EventWatchable } from '@cotera/watchtower-events';

const runs = EventWatchable.for({
  events: ['run.started', 'run.finished'],
  initialValue: [],
  fn: async (payload, get) => fetchRuns(get(filters)),
  // self-heal if an event was missed
  reconcile: { cadence: 30_000 },
  // poll while the socket is down
  fallback: { fn: async () => fetchRuns(), interval: 3_000 },
  debounceMs: 100,
  serializeRefreshes: true,
});

await runs.refresh(); // manual, payload-free refresh
runs.unsubscribe();
```

`fn` receives the event payload — `undefined` on mount, on reconcile, and on a
manual `refresh()` — and a `get` for reading other watchables. Stale responses
from superseded refreshes are dropped, so a slow fetch can never overwrite a
newer one.

The options each handle one failure mode of a live stream:

| Option                                 | Handles                                                        |
| -------------------------------------- | -------------------------------------------------------------- |
| `fallback`                             | the stream is down — poll instead, until it is back             |
| `reconcile`                            | an event was missed — re-fetch on a cadence to converge         |
| `debounceMs`                           | events arrive in bursts — coalesce to one trailing refresh      |
| `serializeRefreshes`                   | refreshes overlap — run one at a time, queue the latest         |
| `serializeQueueStrategy`               | `'latest'` (default) or `'discard'` for that queue              |
| `filter`                               | the event is not about this value — ignore the payload          |
| `equalityFn`                           | the new value equals the old — skip the write, skip the render  |

`subscribe` and `subscribeToConnectionStatus` are overridable per watchable, so
a test — or a second, independent stream — can supply its own transport instead
of the process-wide bus.

## `TwoWayEventWatchable`

An `EventWatchable` that also writes. `setOptimistic` applies the value
immediately and rolls back if `persist` throws.

```ts
import { TwoWayEventWatchable } from '@cotera/watchtower-events';

const title = TwoWayEventWatchable.for({
  event: 'doc.updated',
  initialValue: '',
  fn: async () => fetchTitle(),
  persist: async (value) => saveTitle(value),
});

await title.setOptimistic('New title');
```

## TanStack Query

[`@cotera/watchtower-query`](../query) builds `QueryClientEventWatchable` on top
of this: the same event-driven refresh, plus invalidation of TanStack cache
prefixes when the event arrives.

## Development

```bash
bun install       # from the workspace root
bun run test:run
bun run typecheck
```
