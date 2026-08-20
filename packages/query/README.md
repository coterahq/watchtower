# @cotera/watchtower-query

[TanStack Query](https://tanstack.com/query) bindings for
[`@cotera/watchtower`](../watchtower).

Two watchables that source their values from a `QueryClient`, kept in their own
package so `@tanstack/react-query` is a dependency only of the applications that
actually use them — the core library never imports it.

```bash
bun add @cotera/watchtower-query
# peers
bun add jotai @tanstack/react-query
```

## `QueryWatchable`

Mirrors a query cache entry into a watchable, so data fetched by TanStack can be
read, derived from, and subscribed to like any other watchable value — including
from a model or an action, where there is no component to call `useQuery` in.

```ts
import { QueryWatchable } from '@cotera/watchtower-query';

const user = QueryWatchable.for(queryClient, { queryKey: ['user', id] });

user.snapshot(); // QueryObserverResult: { status, data, error, ... }
const name = user.map((result) => result.data?.name);

user.unsubscribe(); // releases the underlying QueryObserver
```

It is backed by a `QueryObserver`, so it follows the cache entry for as long as
it is subscribed — refetches, invalidations, and background updates all land in
the watchable. `select` and `enabled` are accepted alongside `queryKey`.

Because the value is the full `QueryObserverResult`, loading and error states
come along with the data rather than being modelled separately. `map` down to
what a given consumer needs.

## `QueryClientEventWatchable`

An [`EventWatchable`](../events) that clears TanStack cache prefixes
before it refetches. This is the shape you want when a WebSocket tells you
something changed and several cached slices are now suspect.

```ts
import { QueryClientEventWatchable } from '@cotera/watchtower-query';

const agents = QueryClientEventWatchable.for({
  queryClient,
  queryKeys: [['org', orgId, 'agents']],
  event: 'agent.updated',
  initialValue: [],
  fn: async () => queryClient.fetchQuery(agentsQuery),
});
```

Every option of `EventWatchable` applies here too — `events`, `filter`,
`debounceMs`, `reconcile`, `fallback`, `serializeRefreshes`.

**Invalidation is event-scoped by default.** Prefixes are cleared only when the
refresh came from an event or from a `refresh(payload)` call with an argument.
Mount, a bare `refresh()`, and reconcile ticks all pass `payload === undefined`
and skip invalidation, so those paths keep honouring `staleTime` instead of
forcing a broad refetch. Set `invalidatePrefixesOnEveryRefresh: true` to
invalidate on every refresh regardless.

### Prefix shapes

One prefix is a plain query key. Several unrelated prefixes go in a nested
array — the first element being an array is what distinguishes the two:

```ts
queryKeys: ['org', orgId, 'agents'];                       // one prefix
queryKeys: [['org', orgId, 'agents'], ['org', orgId, 'runs']]; // two
```

`queryKeys` also takes a function, which makes the prefixes reactive: it
receives a `get` for reading other watchables, and the prefix list recomputes
whenever those change.

```ts
queryKeys: (get) => [['org', get(currentOrg), 'agents']],
```

Call `unsubscribe()` when done; it releases the event subscription and any
watchable the dynamic prefix resolver established.

## Development

```bash
bun install       # from the workspace root
bun run test:run
bun run typecheck
```
