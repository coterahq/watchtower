import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { Watchable, type WatchableGetter } from '@cotera/watchtower';
import {
  EventWatchableImpl,
  type EventWatchableOptions,
  type ReadonlyEventWatchable,
} from '@cotera/watchtower-events';

/**
 * Prefix key(s) to pass to TanStack Query `invalidateQueries` before each refresh.
 *
 * Single key: `[orgId, 'resource', 'listPage', ResourceType.Agent]`
 *
 * Several unrelated prefixes use a nested tuple (first element must be an array):
 * `[ [org, 'resource', 'listPage', ResourceType.Chat], queryKeys.agents.all({ orgId }) ]`
 */
export type QueryClientEventWatchableQueryKeys = QueryKey | readonly QueryKey[];

export type QueryClientEventWatchableQueryKeysResolver = (
  get: WatchableGetter
) => QueryClientEventWatchableQueryKeys;

function invalidateKeysToList(
  queryKeys: QueryClientEventWatchableQueryKeys
): QueryKey[] {
  if (queryKeys.length === 0) {
    return [];
  }
  const first = queryKeys[0];
  if (Array.isArray(first)) {
    return [...(queryKeys as readonly QueryKey[])];
  }
  return [queryKeys as QueryKey];
}

export type QueryClientEventWatchableOptions<T, P = unknown> = Omit<
  EventWatchableOptions<T, P>,
  'fn'
> & {
  queryClient: QueryClient;
  /** TanStack prefixes to invalidate before `fn`. */
  queryKeys?:
    | QueryClientEventWatchableQueryKeys
    | QueryClientEventWatchableQueryKeysResolver;
  /**
   * When `false` (default), `queryKeys` invalidation runs only after a websocket
   * (or manual `refresh(payload)` — any call where `payload !== undefined`).
   * Mount, `refresh()` with no arguments, and reconcile timers pass `payload === undefined`,
   * so list pages keep TanStack `staleTime` without forcing a broad `invalidateQueries`.
   * Set `true` to restore prefix invalidation on every refresh (legacy behaviour).
   */
  invalidatePrefixesOnEveryRefresh?: boolean;
  fn: (payload: P | undefined, get: WatchableGetter) => Promise<T>;
};

/**
 * {@link EventWatchableImpl} wired to TanStack Query: clears configured prefix keys when a
 * refresh came from an event (`payload !== undefined`) by default, then runs `fn` so nested
 * `fetchQuery` can refetch stale slices while mount/sync path keeps cache within `staleTime`.
 */
export class QueryClientEventWatchable {
  private constructor() {}

  static for<T, P = unknown>(
    opts: QueryClientEventWatchableOptions<T, P>
  ): ReadonlyEventWatchable<T> {
    const {
      queryClient,
      queryKeys,
      invalidatePrefixesOnEveryRefresh,
      fn,
      ...rest
    } = opts;
    const hasPrefixes = queryKeys !== undefined;
    const dynamicQueryKeysWatchable =
      typeof queryKeys === 'function'
        ? Watchable.from((get) => queryKeys(get))
        : null;
    let prefixes =
      queryKeys !== undefined && typeof queryKeys !== 'function'
        ? invalidateKeysToList(queryKeys)
        : dynamicQueryKeysWatchable !== null
        ? invalidateKeysToList(dynamicQueryKeysWatchable.snapshot())
        : [];
    const unsubDynamicQueryKeys =
      dynamicQueryKeysWatchable === null
        ? null
        : dynamicQueryKeysWatchable.subscribe((next) => {
            prefixes = invalidateKeysToList(next);
          });

    const base = EventWatchableImpl.for<T, P>({
      ...rest,
      fn: async (payload, get) => {
        const invalidatePrefixesNow =
          hasPrefixes &&
          (invalidatePrefixesOnEveryRefresh === true || payload !== undefined);
        if (invalidatePrefixesNow) {
          await Promise.all(
            prefixes.map((queryKey) =>
              queryClient.invalidateQueries({ queryKey })
            )
          );
        }
        return fn(payload, get);
      },
    });
    const baseUnsubscribe = base.unsubscribe.bind(base);
    base.unsubscribe = () => {
      unsubDynamicQueryKeys?.();
      baseUnsubscribe();
    };
    return base;
  }
}
