# `@cotera/watchtower` — watchables

A `Watchable<T>` is a value you can read synchronously, subscribe to, and derive
from. Every variant adds exactly one concern.

Peers: `react`, `jotai`.

## `ReadonlyWatchable<T>`

What a derived value exposes, and the type most consumers should accept:

```ts
type ReadonlyWatchable<T> = {
  snapshot(): T;
  subscribe(cb: (t: T) => void): () => void;   // returns unsubscribe
  map<U>(cb: (t: T) => U): ReadonlyWatchable<U>;
  asAtom(): Atom<T>;
  lastUpdateTime: number;
};
```

`Watchable<T>` is that plus `set(value)` and `setFromSource(value)`. Accept
`ReadonlyWatchable<T>` in function signatures unless you actually need to write.

## Creating

```ts
Watchable.fromValue<T>(value, opts?: {
  updater?: (value: T) => T;         // runs on every set()
  equalityFn?: (a: T, b: T) => boolean;  // default: () => false — never dedupes
}): Watchable<T>

Watchable.from<T>(
  deriveFn: (get: <U>(w: ReadonlyWatchable<U>) => U) => T,
  opts?: { updater?: (value: T) => T }
): ReadonlyWatchable<T>
```

Reads through `get` inside `from` register as dependencies, so the derived value
recomputes when any source changes. The dependency set is re-tracked on every
evaluation, so conditional reads work.

```ts
const firstName = Watchable.fromValue('Ada');
const lastName = Watchable.fromValue('Lovelace');
const fullName = Watchable.from((get) => `${get(firstName)} ${get(lastName)}`);

fullName.snapshot();        // 'Ada Lovelace'
firstName.set('Grace');
fullName.snapshot();        // 'Grace Lovelace'

const unsubscribe = fullName.subscribe((name) => console.log(name));
```

`set` runs the configured `updater` and skips the write when `equalityFn` says
the value is unchanged. `setFromSource` skips the updater — use it when syncing
from an external source of truth that is already up to date (a URL, a server
frame), so you do not write straight back to it.

## Hooks

```ts
useWatchableValue<T>(w: ReadonlyWatchable<T>): T      // subscribes, re-renders
useWatchableUpdatedAt(w: ReadonlyWatchable<any>): number
```

```tsx
function Greeting() {
  return <h1>Hello {useWatchableValue(fullName)}</h1>;
}
```

`JotaiProvider` is exported for the rare case of mixing raw jotai hooks with
watchables — it is a jotai `Provider` bound to the library's internal store. You
do not need it to use `useWatchableValue`.

## The store

There is one module-level `createStore()` inside this package, shared by every
watchable in the process. Consequences:

- Watchables are **not** per-React-tree. Two roots share values.
- Two copies of `@cotera/watchtower` in `node_modules` = two stores. Subscriptions
  in one are invisible to the other, silently. Dedupe the dependency.
- Nothing is scoped to a component lifecycle. A module-level watchable lives for
  the process; anything with a timer or subscription needs an explicit
  `unsubscribe()` (see the variants below).

## `PollingWatchable`

Refetches on an interval, and can stop itself.

```ts
PollingWatchable.create<T>(
  pollFn: (get: WatchableGetter) => Promise<T>,
  opts: { intervalMs: number; initialValue: T; stopWhen?: (value: T) => boolean }
): ReadonlyPollingWatchable<T>    // ReadonlyWatchable<T> & { restart(); unsubscribe() }
```

```ts
const status = PollingWatchable.create(async () => fetchStatus(), {
  intervalMs: 2_000,
  initialValue: 'pending',
  stopWhen: (value) => value === 'complete',
});
status.restart();       // after stopWhen halted it
status.unsubscribe();   // stop and release the timer
```

Notes: the first poll fires immediately on construction, not after `intervalMs`.
Intervals are *between* completions — a slow fetch does not stack. A rejected
poll is swallowed and the loop continues. Responses from before a `restart()`
are dropped by generation counter, so a slow in-flight fetch cannot land after
you restarted.

## `MixedSourceWatchable`

Derived, but a user's `set` overrides the derived value until the sources change
again.

```ts
MixedSourceWatchable.from<T>(
  deriveFn: (get) => T,
  options?: {
    shouldAcceptDerived?: (
      derived: T,
      override: T | null,
      lastUserEditTime: number,
      get: <U>(w: ReadonlyWatchable<U>) => U
    ) => boolean;
  }
): MixedSourceWatchable<T>   // ReadonlyWatchable<T> & { set(v); unsubscribe() }
```

Value trace: dep changes → derived value → `.set()` → manual value → dep changes
again → derived value. `shouldAcceptDerived` returning false keeps the override,
which is how a user's in-progress edit survives a slightly older server push:

```ts
shouldAcceptDerived: (derived, _override, lastUserEditTime) =>
  derived.updatedAt >= lastUserEditTime,
```

Call `unsubscribe()` to release the internal subscription to the derived atom.

## `PersistentWatchable`

```ts
PersistentWatchable.fromStorage<T>(props: {
  storage: {
    getItem: (key: string, defaultValue: T) => T;
    setItem: (key: string, value: T) => Promise<void>;
    subscribe: (key: string, listener: (value: T) => void) => () => void;
  };
  storageKey: string;
  defaultValue: T;
  map?: (value: T) => T;        // applied to the value read at construction
  equalityFn?: (a: T, b: T) => boolean;   // defaults to a === b here
  updater?: (value: T) => T;
}): PersistentWatchable<T>
```

Reads its initial value from the adapter synchronously and writes back on every
`set`. The write is fire-and-forget — `set` does not await `setItem`, so a
failed write does not roll the value back.

## `WatchableRecord`

A record whose keys are each their own watchable, so a component subscribing to
one field does not re-render when another changes.

```ts
const form = WatchableRecord.fromValue({ name: 'Ada', email: '' });

form.getItem('name');            // Watchable<string> — subscribe to just this
form.setItem('email', 'a@b.c');  // adds the key if absent
form.delete('email');
form.keys();                     // string[]
form.has('name');
form.snapshot();                 // the whole object
```

`getItem` throws on a missing key; `setItem` creates it. The record itself is a
`ReadonlyWatchable<T>`, so `useWatchableValue(form)` re-renders on any field.

## `StalenessWatchable`

```ts
StalenessWatchable.forValue(
  value: ReadonlyWatchable<any>,
  deps: ReadonlyWatchable<any>[]
): ReadonlyWatchable<'stale' | 'ok'>
```

Reports `'stale'` when any dep's `lastUpdateTime` is newer than the value's —
"the inputs moved and this has not caught up yet".

## Idioms from a large app

**Watchables live on models, not at module scope.** Module-level state is
process-wide and never disposed; anything belonging to a screen belongs to the
model registered for that screen (`references/models.md`). Module scope is for
values that really are global — a feature flag snapshot, a connection status.

**Components read with the hook, actions read with `snapshot()`.**

```tsx
const name = useWatchableValue(model.nameWatchable);      // subscribes
```

```ts
const name = model.nameWatchable.snapshot();              // one-shot, no render
```

An action runs outside React and must not subscribe; a component that calls
`snapshot()` silently stops updating. This is the single most common mix-up.

**`updater` is write-through; `setFromSource` is the way back in.** A watchable
that mirrors something outside the app — a URL query parameter, a storage key —
writes on `set` through its updater, and takes external changes through
`setFromSource` so the write does not echo back:

```ts
const tab = Watchable.fromValue(initialTab, {
  equalityFn: (a, b) => a === b,
  updater: (value) => {
    urlAdapter.setParam('tab', serialize(value));   // set() → URL
    return value;
  },
});

// browser back/forward → watchable, without re-writing the URL
tab.setFromSource(parse(params.get('tab')));
```

**`equalityFn` is not an optimisation, it is the default you usually want.**
`Watchable.fromValue` never dedupes unless told to, so a value re-set on every
frame re-renders every subscriber. Two shapes recur: `(a, b) => a === b` for
scalars, and a structural compare for objects rebuilt from an API response.

**A side-effect watchable declares `equalityFn: () => true`.** Some watchables
exist only for what their `fn` does — invalidating a query cache, say — and have
no value worth publishing. Always-equal means no subscriber is ever notified.

**Shared live values come from one factory, not from each model.** An app with a
push stream tends to grow a single object that mints and refcounts its
`EventWatchable`s, injected into models as a constructor prop, with
`unsubscribe()` in `dispose()`. It keeps two screens watching the same resource
from opening two subscriptions. See `references/events.md`.

## What lives elsewhere

- `EventWatchable`, `TwoWayEventWatchable`, the event bus → `@cotera/watchtower-events`
- `QueryWatchable`, `QueryClientEventWatchable` → `@cotera/watchtower-query`

Nothing in this package imports either. That is the point of the split.
