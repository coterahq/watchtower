/**
 * WatchTower — observable values for React.
 *
 * A `Watchable<T>` is a value you can read synchronously, subscribe to, and
 * derive from. The variants add one concern each: polling, optimistic writes,
 * persistence, or a per-key record.
 *
 * This package is self-contained. The layers built on top of it ship
 * separately: `@cotera/watchtower-events` for the event bus and event-driven
 * refresh, `@cotera/watchtower-models` and `@cotera/watchtower-actions` for
 * viewmodels and actions, and `@cotera/watchtower-query` for TanStack Query
 * bindings.
 */
export * from './watchable';
