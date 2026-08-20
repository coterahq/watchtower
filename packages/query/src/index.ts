/**
 * TanStack Query bindings for `watchables`.
 *
 * A separate package so `@tanstack/react-query` is a dependency only of the
 * applications that actually use these — the core library never imports it.
 */
export {
  QueryWatchable,
  QueryWatchableImpl,
  type ReadonlyQueryWatchable,
  type QueryWatchableOptions,
} from './query-watchable';
export {
  QueryClientEventWatchable,
  type QueryClientEventWatchableQueryKeys,
  type QueryClientEventWatchableQueryKeysResolver,
  type QueryClientEventWatchableOptions,
} from './query-client-event-watchable';
