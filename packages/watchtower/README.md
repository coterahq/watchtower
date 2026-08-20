# @cotera/watchtower

Observable values for React — the base layer of WatchTower.

A `Watchable<T>` is a value you can read synchronously, subscribe to, and derive
from. The variants each add one concern: polling, persistence, a per-key record,
or a derived value a user can override.

This package stands alone. The layers built on it ship separately:
[`@cotera/watchtower-events`](../events) for the event bus and event-driven
refresh, [`@cotera/watchtower-models`](../models) for viewmodels,
[`@cotera/watchtower-actions`](../actions) for actions, and
[`@cotera/watchtower-query`](../query) for TanStack Query bindings.

## Install

```bash
bun add @cotera/watchtower
bun add jotai react   # peers
```

Reads inside `Watchable.from` register as dependencies, so a derived value
recomputes when any source changes.

```ts
import { Watchable, useWatchableValue } from '@cotera/watchtower';

const firstName = Watchable.fromValue('Ada');
const lastName = Watchable.fromValue('Lovelace');

const fullName = Watchable.from((get) => `${get(firstName)} ${get(lastName)}`);

fullName.snapshot(); // 'Ada Lovelace'
firstName.set('Grace');
fullName.snapshot(); // 'Grace Lovelace'

const unsubscribe = fullName.subscribe((name) => console.log(name));
```

In a component, `useWatchableValue` subscribes and re-renders on change:

```tsx
function Greeting() {
  const name = useWatchableValue(fullName);
  return <h1>Hello {name}</h1>;
}
```

Mutation methods live on `Watchable`; `Watchable.from` returns a
`ReadonlyWatchable<T>`, which exposes only `snapshot`, `subscribe`, `map`, and
`asAtom`. That distinction is the API's way of saying a derived value has no
setter.

`set` runs the configured `updater` and skips the write when `equalityFn` says
the value is unchanged. `setFromSource` skips the updater — use it when syncing
from an external source of truth that is already up to date (a URL, say) so you
do not write straight back to it.

## The variants

Each one is a `Watchable` with one extra concern handled for you.

**`PollingWatchable`** — refetches on an interval, and can stop itself.

```ts
const status = PollingWatchable.create(async () => fetchStatus(), {
  intervalMs: 2_000,
  initialValue: 'pending',
  stopWhen: (value) => value === 'complete',
});

status.restart();
status.unsubscribe();
```

**`EventWatchable`** and **`TwoWayEventWatchable`** — refetch when a named event
arrives on a push stream, with optimistic writes on top. They live in
[`@cotera/watchtower-events`](../events), which owns the event bus they listen
on, so an application with no WebSocket never takes that code.

**`MixedSourceWatchable`** — derived, but a user's `set` overrides the derived
value until the sources change again. `shouldAcceptDerived` decides whether an
incoming derived value is allowed to discard the override, which is how you keep
a user's in-progress edit from being clobbered by a slightly older server push.

**`PersistentWatchable`** — reads its initial value from a storage adapter and
writes back on every `set`.

**`WatchableRecord`** — a record whose keys are each their own watchable, so a
component can subscribe to one field without re-rendering on the others.

**`StalenessWatchable`** — compares `lastUpdateTime` across a value and its
dependencies, and reports `'stale' | 'ok'`.

## The event bus

Values kept live by a WebSocket or SSE stream are the job of
[`@cotera/watchtower-events`](../events). It carries the process-wide bus your
transport emits into, `EventWatchable` for refreshing off it, and the fallback
polling that takes over while the stream is down. Nothing in this package
imports it.

## TanStack Query

Bindings live in [`@cotera/watchtower-query`](../query) — `QueryWatchable`
mirrors a query cache entry into a watchable, and `QueryClientEventWatchable`
invalidates cache prefixes when an event arrives. They are a separate package so
`@tanstack/react-query` is never a dependency of this one.

## Development

```bash
bun install       # from the workspace root
bun run test:run
bun run typecheck
```
