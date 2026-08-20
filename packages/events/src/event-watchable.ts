/**
 * Event-driven watchables: values that refetch when a named event arrives.
 *
 * `EventWatchable` is a `Watchable` whose refresh trigger lives outside the
 * process's own state — a WebSocket or SSE frame delivered through the
 * {@link ./event-bus | event bus}. Everything else here layers one concern onto
 * that: `fallback` polls while the stream is down, `reconcile` self-heals after
 * a missed event, `debounceMs` and `serializeRefreshes` shape bursty traffic,
 * and `TwoWayEventWatchable` adds optimistic writes with rollback.
 */
import {
  Watchable,
  type ReadonlyWatchable,
  type WatchableGetter,
} from '@cotera/watchtower';
import {
  subscribe as subscribeToBroadcastEvent,
  subscribeToConnectionStatus as subscribeToConnectionStatusDefault,
} from './event-bus';
import { atom, Atom, WritableAtom } from 'jotai';

export type ReadonlyEventWatchable<T> = ReadonlyWatchable<T> & {
  refresh: (payload?: unknown) => Promise<void>;
  unsubscribe: () => void;
};

export type EventWatchableFallback<T> = {
  /** Fetches the value when events are not received (e.g. WebSocket down). */
  fn: () => Promise<T>;
  /** Poll interval in ms. Defaults to 3000. */
  interval?: number;
};

export type ReconcileOptions = {
  /** Poll fn(undefined) on this cadence (ms) to self-heal after missed events. */
  cadence: number;
};

export type EventWatchableOptions<T, P = unknown> = {
  /** Event type(s) to subscribe to. When multiple, refreshes on any. Requires useEvents with these types somewhere in the tree. */
  event?: string;
  events?: string[];
  initialValue: T;
  /** Fetches the value. Receives the event payload when triggered by an event, undefined on runOnMount or manual refresh(); get(w) reads current value of a watchable (like Watchable.from(get => ...)). */
  fn: (payload: P | undefined, get: WatchableGetter) => Promise<T>;
  /** If true (default), fetches on creation. */
  runOnMount?: boolean;
  /** When provided, only refresh when this returns true for the event payload. */
  filter?: (payload: P) => boolean;
  /** Override for testing. Defaults to broadcast event bus. */
  subscribe?: (event: string, cb: (payload?: unknown) => void) => () => void;
  /** When provided, skips store update when this returns true (prevents redundant rerenders when event data equals current state). */
  equalityFn?: (a: T, b: T) => boolean;
  /** When provided, polls when WebSocket is disconnected (fallback for WebSocket failures). */
  fallback?: EventWatchableFallback<T>;
  /** When provided, polls fn(undefined) on the given cadence (ms) to self-heal if events were missed. */
  reconcile?: ReconcileOptions;
  /** Override for testing. Defaults to broadcast event bus connection status. */
  subscribeToConnectionStatus?: (
    cb: (connected: boolean) => void
  ) => () => void;
  /** When provided, debounces event-triggered refreshes by this many ms (trailing edge). Useful when events fire in rapid bursts. */
  debounceMs?: number;
  /** When true, only runs one refresh at a time and queues the latest follow-up refresh while in flight. */
  serializeRefreshes?: boolean;
  /** Queue strategy while a serialized refresh is in flight. `latest` keeps one trailing refresh, `discard` keeps only one trailing refresh and always replaces it with the newest trigger. */
  serializeQueueStrategy?: 'latest' | 'discard';
};

const FALLBACK_POLL_INTERVAL_MS = 3000;

export class EventWatchableImpl<T, P = unknown>
  extends Watchable<T>
  implements ReadonlyEventWatchable<T>
{
  private _unsub: () => void;
  private _fn: (payload: P | undefined, get: WatchableGetter) => Promise<T>;
  /** Incremented on each refresh start; used to ignore stale responses from concurrent calls */
  private _refreshGeneration = 0;
  private _fallback: EventWatchableFallback<T> | undefined;
  private _fallbackTimerId: ReturnType<typeof setTimeout> | null = null;
  /** Latest push-stream connection state; the fallback only runs while false. */
  private _isConnected = false;
  private _unsubConnectionStatus: (() => void) | undefined;
  private _reconcile: ReconcileOptions | undefined;
  private _reconcileTimerId: ReturnType<typeof setTimeout> | undefined =
    undefined;
  private _debounceTimerId: ReturnType<typeof setTimeout> | undefined =
    undefined;
  private _debouncedPayload: P | undefined = undefined;
  private _serializeRefreshes: boolean;
  private _serializeQueueStrategy: 'latest' | 'discard';
  private _isRefreshing = false;
  private _queuedRefreshPayload: P | undefined = undefined;
  private _hasQueuedRefresh = false;

  protected constructor(
    baseAtom: (watchable: Watchable<T>) => WritableAtom<T, [T], unknown>,
    opts: EventWatchableOptions<T, P>
  ) {
    super(baseAtom, opts.equalityFn);
    this._fn = opts.fn;
    this._fallback = opts.fallback;
    this._reconcile = opts.reconcile;
    this._serializeRefreshes = opts.serializeRefreshes ?? false;
    this._serializeQueueStrategy = opts.serializeQueueStrategy ?? 'latest';

    const eventList =
      opts.events ?? (opts.event !== undefined ? [opts.event] : []);
    if (eventList.length === 0) {
      throw new Error('EventWatchable requires event or events');
    }

    const sub = opts.subscribe ?? subscribeToBroadcastEvent;
    const unsubs = eventList.map((ev) =>
      sub(ev, (payload) => {
        if (opts.filter !== undefined && !opts.filter(payload as P)) {
          return;
        }
        if (opts.debounceMs !== undefined) {
          this._debouncedPayload = payload as P;
          if (this._debounceTimerId !== undefined) {
            clearTimeout(this._debounceTimerId);
          }
          this._debounceTimerId = setTimeout(() => {
            this._debounceTimerId = undefined;
            const p = this._debouncedPayload;
            this._debouncedPayload = undefined;
            this._refreshInBackground(p);
          }, opts.debounceMs);
        } else {
          this._refreshInBackground(payload as P);
        }
      })
    );
    const subToConnectionStatus =
      opts.subscribeToConnectionStatus ?? subscribeToConnectionStatusDefault;

    this._unsub = () => {
      this._isDisposed = true;
      unsubs.forEach((u) => u());
      this._unsubConnectionStatus?.();
      this._clearFallbackTimer();
      this._clearReconcileTimer();
      this._clearDebounceTimer();
    };

    if (opts.runOnMount !== false) {
      this._refreshInBackground(undefined);
    }

    if (this._fallback !== undefined) {
      this._unsubConnectionStatus = subToConnectionStatus((connected) => {
        this._isConnected = connected;
        if (connected) {
          this._clearFallbackTimer();
        } else {
          this._scheduleFallbackPoll();
        }
      });
    }

    if (this._reconcile !== undefined) {
      this._scheduleReconcile();
    }
  }

  private _isDisposed = false;

  private _refreshInBackground(payload?: P): void {
    void this._refresh(payload).catch(() => {
      // Avoid uncaught promise rejections from background refresh triggers.
      // Callers that need error handling should await refresh().
    });
  }

  private _clearReconcileTimer(): void {
    if (this._reconcileTimerId !== undefined) {
      clearTimeout(this._reconcileTimerId);
      this._reconcileTimerId = undefined;
    }
  }

  private _clearDebounceTimer(): void {
    if (this._debounceTimerId !== undefined) {
      clearTimeout(this._debounceTimerId);
      this._debounceTimerId = undefined;
    }
  }

  /** Schedules next reconcile poll (fn(undefined)) after cadence ms to self-heal after missed events. */
  private _scheduleReconcile(): void {
    if (this._isDisposed) {
      return;
    }
    const reconcile = this._reconcile;
    if (reconcile === undefined) {
      return;
    }
    this._reconcileTimerId = setTimeout(() => {
      this._reconcileTimerId = undefined;
      if (this._isDisposed) {
        return;
      }
      void this._refresh(undefined)
        .catch(() => {
          // Reconcile is best-effort; keep cadence even on refresh failures.
        })
        .finally(() => {
          if (!this._isDisposed) {
            this._scheduleReconcile();
          }
        });
    }, reconcile.cadence);
  }

  private _clearFallbackTimer(): void {
    if (this._fallbackTimerId !== null) {
      clearTimeout(this._fallbackTimerId);
      this._fallbackTimerId = null;
    }
  }

  /**
   * Runs the fallback poll loop while the push stream is down.
   *
   * Connection state is re-checked at three points — before scheduling, when
   * the timer fires, and again before chaining the next tick — because a
   * reconnect can land at any of them. Without the check in the chaining step
   * a reconnect that arrives mid-fetch is undone by `finally` immediately
   * rescheduling, leaving the watchable polling forever on a healthy socket.
   *
   * Clearing first also keeps repeated disconnects from stacking parallel
   * loops onto the single `_fallbackTimerId` slot.
   */
  private _scheduleFallbackPoll(): void {
    const fallback = this._fallback;
    if (fallback === undefined) {
      return;
    }
    this._clearFallbackTimer();
    if (this._isConnected || this._isDisposed) {
      return;
    }
    const interval = fallback.interval ?? FALLBACK_POLL_INTERVAL_MS;
    this._fallbackTimerId = setTimeout(() => {
      this._fallbackTimerId = null;
      if (this._isConnected || this._isDisposed) {
        return;
      }
      void fallback
        .fn()
        .then((value) => {
          this.set(value);
        })
        .catch(() => {
          // Best-effort; keep polling while the push stream is still down.
        })
        .finally(() => {
          this._scheduleFallbackPoll();
        });
    }, interval);
  }

  static for<T, P = unknown>(
    opts: EventWatchableOptions<T, P>
  ): ReadonlyEventWatchable<T> {
    return new EventWatchableImpl<T, P>(() => atom(opts.initialValue), opts);
  }

  private async _runRefresh(payload?: P): Promise<void> {
    const generation = ++this._refreshGeneration;
    const get: WatchableGetter = <U>(w: ReadonlyWatchable<U>): U => w.snapshot();
    const value = await this._fn(payload, get);
    if (generation !== this._refreshGeneration) {
      return;
    }
    this.set(value);
  }

  private async _refresh(payload?: P): Promise<void> {
    if (!this._serializeRefreshes) {
      await this._runRefresh(payload);
      return;
    }

    if (this._isRefreshing) {
      if (
        this._serializeQueueStrategy === 'discard' &&
        this._hasQueuedRefresh === false
      ) {
        this._queuedRefreshPayload = payload;
        this._hasQueuedRefresh = true;
        return;
      }
      this._queuedRefreshPayload = payload;
      this._hasQueuedRefresh = true;
      return;
    }

    this._isRefreshing = true;
    let currentPayload = payload;
    try {
      do {
        this._queuedRefreshPayload = undefined;
        this._hasQueuedRefresh = false;
        await this._runRefresh(currentPayload);
        currentPayload = this._queuedRefreshPayload;
      } while (this._hasQueuedRefresh);
    } finally {
      this._isRefreshing = false;
      this._queuedRefreshPayload = undefined;
      this._hasQueuedRefresh = false;
    }
  }

  refresh(payload?: unknown): Promise<void> {
    return this._refresh(payload as P);
  }

  unsubscribe(): void {
    this._unsub();
  }
}

export const EventWatchable = {
  for: EventWatchableImpl.for,
};

export type TwoWayEventWatchable<T> = ReadonlyEventWatchable<T> & {
  setOptimistic: (value: T) => Promise<void>;
};

export type TwoWayEventWatchableOptions<T, P = unknown> = EventWatchableOptions<
  T,
  P
> & {
  /** Persist optimistic value. Called when setOptimistic is used. If it throws, we rollback to previous value. */
  persist: (value: T) => Promise<void>;
};

export class TwoWayEventWatchableImpl<T, P = unknown>
  implements TwoWayEventWatchable<T>
{
  private _inner: EventWatchableImpl<T, P>;
  private _persist: (value: T) => Promise<void>;

  private constructor(
    inner: EventWatchableImpl<T, P>,
    persist: (value: T) => Promise<void>
  ) {
    this._inner = inner;
    this._persist = persist;
  }

  get lastUpdateTime(): number {
    return this._inner.lastUpdateTime;
  }

  static for<T, P = unknown>(
    opts: TwoWayEventWatchableOptions<T, P>
  ): TwoWayEventWatchable<T> {
    const { persist, ...eventOpts } = opts;
    const inner = EventWatchableImpl.for(eventOpts) as EventWatchableImpl<T, P>;
    return new TwoWayEventWatchableImpl<T, P>(inner, persist);
  }

  async setOptimistic(value: T): Promise<void> {
    const previous = this._inner.snapshot();
    (this._inner as Watchable<T>).set(value);
    try {
      await this._persist(value);
    } catch {
      (this._inner as Watchable<T>).set(previous);
      throw new Error('Persist failed, rolled back');
    }
  }

  refresh(payload?: unknown): Promise<void> {
    return this._inner.refresh(payload);
  }

  unsubscribe(): void {
    this._inner.unsubscribe();
  }

  map<U>(cb: (t: T) => U): ReadonlyWatchable<U> {
    return this._inner.map(cb);
  }

  snapshot(): T {
    return this._inner.snapshot();
  }

  subscribe(cb: (t: T) => void): () => void {
    return this._inner.subscribe(cb);
  }

  asAtom(): Atom<T> {
    return this._inner.asAtom();
  }
}

export const TwoWayEventWatchable = {
  for: TwoWayEventWatchableImpl.for,
};
