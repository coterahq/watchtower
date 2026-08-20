# Testing WatchTower code

The workspace runs `vitest` with `jsdom` and `@testing-library/react`. From the
root: `bun run test` (watch), `bun run test:run` (once), `bun run typecheck`.

## The shared store bites in tests

There is one module-level jotai store inside `@cotera/watchtower`, shared across
every test in a file. A module-level watchable therefore carries state from one
test into the next. Create watchables **inside** the test or a `beforeEach`, not
at module scope, unless the test is specifically about persistence across
mounts.

## Reset the event bus between tests

```ts
import { resetEventBus } from '@cotera/watchtower-events';

beforeEach(() => resetEventBus());
```

It drops every listener and resets connection state to `false` (disconnected).
Without it, watchables from a previous test are still subscribed and will refetch
when the next test emits.

Remember that connection state starts *disconnected*: an `EventWatchable` with a
`fallback` begins polling immediately unless the test calls
`setConnectionStatus(true)`.

## Injecting a transport instead of the global bus

`EventWatchable` accepts `subscribe` and `subscribeToConnectionStatus`
overrides, which is cleaner than driving the process-wide bus:

```ts
const listeners = new Set<(p?: unknown) => void>();
const w = EventWatchable.for({
  event: 'x',
  initialValue: 0,
  fn: async () => next(),
  subscribe: (_event, cb) => { listeners.add(cb); return () => listeners.delete(cb); },
});
listeners.forEach((cb) => cb({ some: 'payload' }));
```

## Timers

`fallback`, `reconcile`, `debounceMs`, and `PollingWatchable` are all
`setTimeout` loops that reschedule on completion. With `vi.useFakeTimers()`,
advancing time is not enough — the pending promise has to flush too:

```ts
await vi.advanceTimersByTimeAsync(3_000);
```

Always `unsubscribe()` in cleanup. A leaked poll loop keeps a fake-timer test
advancing forever and a real-timer test leaking across files.

## Scopes without React

```ts
const scope = ModelScopeManager.create();
scope.addModels([new DocModel('a')]);
expect(scope.getModelOfType(DocModel)).toBeTruthy();
```

For actions, build a manager directly:

```ts
const manager = new ActionsManager([new SaveRunAction()], {
  logger: new NoopLogger(),
});
manager.addModels([new RunModel('a')]);
const result = await manager.getAction(SaveRunAction).askOrExecute({}, manager);
expect(result.isOk()).toBe(true);
```

`NoopLogger` keeps expected-error tests from spraying the console —
`ConsoleLogger` is the default and *will* log every `err()` result.

## Strict Mode

`ModelScopeFactory` is built for double-invoked effects; tests that render under
`<React.StrictMode>` are the ones that catch zombie-model regressions. Assert
that `dispose()` ran exactly once for a mount/unmount cycle, and that a remount
yields a *live* model rather than the disposed one.

## Asserting on watchables

Prefer `snapshot()` over rendering when the test is about the value. For
subscription behaviour, count callback invocations — that is how you catch a
missing `equalityFn` causing redundant renders, since the default equality on
`Watchable.fromValue` never dedupes.
