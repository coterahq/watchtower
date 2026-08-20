# `@cotera/watchtower-query` — TanStack Query bindings

Two watchables sourced from a `QueryClient`. A separate package so
`@tanstack/react-query` is a dependency only of apps that use them — the core
library never imports it.

Peers: `jotai`, `@tanstack/react-query` (v5). Depends on `@cotera/watchtower`
and `@cotera/watchtower-events`.

## `QueryWatchable`

Mirrors a query cache entry into a watchable, so data TanStack fetched can be
read, derived from, and subscribed to like any other watchable — **including
from a model or an action, where there is no component to call `useQuery` in.**
That is the reason this exists; inside a component, `useQuery` is still the
right tool.

```ts
const user = QueryWatchable.for(queryClient, { queryKey: ['user', id] });

user.snapshot();   // QueryObserverResult: { status, data, error, isLoading, ... }
const name = user.map((result) => result.data?.name);

user.unsubscribe();   // releases the underlying QueryObserver
```

```ts
QueryWatchable.for<TData, TError>(
  queryClient: QueryClient,
  options: { queryKey: QueryKey; select?; enabled? }
): ReadonlyQueryWatchable<TData, TError>
```

Backed by a `QueryObserver`, so it follows the cache entry for as long as it is
subscribed — refetches, invalidations, and background updates all land in the
watchable.

The value is the **full `QueryObserverResult`**, not the data: loading and error
states come along rather than being modelled separately. `map` down to what a
consumer needs. Do not reach for a separate `isLoading` watchable.

`unsubscribe()` is required for anything shorter-lived than the process — the
observer keeps the query subscribed and prevents garbage collection otherwise.

## `QueryClientEventWatchable`

An `EventWatchable` that clears TanStack cache prefixes before it refetches —
the shape you want when a socket says something changed and several cached
slices are now suspect.

```ts
const agents = QueryClientEventWatchable.for({
  queryClient,
  queryKeys: [['org', orgId, 'agents']],
  event: 'agent.updated',
  initialValue: [],
  fn: async () => queryClient.fetchQuery(agentsQuery),
});
```

Every `EventWatchable` option applies — `events`, `filter`, `debounceMs`,
`reconcile`, `fallback`, `serializeRefreshes` — plus `queryClient`, `queryKeys`,
and `invalidatePrefixesOnEveryRefresh`. Returns `ReadonlyEventWatchable<T>`.

### Invalidation is event-scoped by default

Prefixes are cleared only when the refresh came from an event, or from a
`refresh(payload)` call **with an argument**. Mount, a bare `refresh()`, and
reconcile ticks all pass `payload === undefined` and skip invalidation, so those
paths keep honouring `staleTime` instead of forcing a broad refetch.

Set `invalidatePrefixesOnEveryRefresh: true` to invalidate on every refresh
regardless. Reach for it only when a list genuinely must be re-fetched on mount;
it is the legacy behaviour and it costs a round trip per mount.

### Prefix shapes

One prefix is a plain query key. Several unrelated prefixes go in a nested array
— **the first element being an array is what distinguishes the two**:

```ts
queryKeys: ['org', orgId, 'agents'];                            // one prefix
queryKeys: [['org', orgId, 'agents'], ['org', orgId, 'runs']];  // two
```

Get this wrong and a key like `[orgId, 'agents']` is read as two prefixes,
`orgId` and `'agents'` — invalidating far more than intended, silently.

`queryKeys` also takes a function, which makes the prefixes reactive: it
receives a `get` for reading other watchables, and the list recomputes whenever
those change.

```ts
queryKeys: (get) => [['org', get(currentOrg), 'agents']],
```

Invalidation runs `Promise.all` over the prefixes and awaits it *before* `fn`,
so a `fetchQuery` inside `fn` sees the cleared cache.

`unsubscribe()` releases the event subscription and any watchable the dynamic
prefix resolver established.
