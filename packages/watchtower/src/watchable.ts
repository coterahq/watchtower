import {
  createStore,
  Atom,
  atom,
  WritableAtom,
  Provider,
  useAtom,
  Getter,
} from 'jotai';
import React from 'react';

const store = createStore();

export type StaleState = 'stale' | 'ok';

export type ReadonlyWatchable<T> = {
  map: <U>(cb: (t: T) => U) => ReadonlyWatchable<U>;
  snapshot(): T;
  asAtom(): Atom<T>;
  lastUpdateTime: number;
  subscribe(cb: (t: T) => void): () => void;
};

export class Watchable<T> implements ReadonlyWatchable<T> {
  private _atom: WritableAtom<T, [T], unknown>;
  private _equalityFn: ((a: T, b: T) => boolean) | undefined;
  private _updater: (value: T) => T = (x) => x;

  lastUpdateTime: number = Date.now();

  protected constructor(
    baseAtom: (watchable: Watchable<T>) => WritableAtom<T, [T], unknown>,
    equalityFn?: (a: T, b: T) => boolean,
    updater?: (value: T) => T
  ) {
    this._atom = baseAtom(this);
    this._equalityFn = equalityFn ?? ((_a, _b) => false);
    this._updater = updater ?? ((x) => x);
  }

  static fromValue<T>(
    value: T,
    opts?: {
      updater?: (value: T) => T;
      equalityFn?: (a: T, b: T) => boolean;
    }
  ): Watchable<T> {
    return new Watchable<T>(() => atom(value), opts?.equalityFn, opts?.updater);
  }

  // Static method to create derived watchables
  static from<T>(
    deriveFn: (get: <U>(watchable: ReadonlyWatchable<U>) => U) => T,
    opts?: {
      updater?: (value: T) => T;
    }
  ): ReadonlyWatchable<T> {
    const sourceWatchables: ReadonlyWatchable<any>[] = [];

    // Create a getter function that tracks which watchables are accessed
    const get = <U>(watchable: ReadonlyWatchable<U>): U => {
      if (!sourceWatchables.includes(watchable)) {
        sourceWatchables.push(watchable);
      }
      return store.get(watchable.asAtom());
    };

    // Create the derived atom
    const derivedAtom = (watchable: Watchable<T>) =>
      atom((jotaiGet: Getter): T => {
        // Reset tracking for each evaluation
        sourceWatchables.length = 0;

        // Create a getter that uses jotai's get and tracks dependencies
        const trackedGet = <U>(watchable: ReadonlyWatchable<U>): U => {
          if (!sourceWatchables.includes(watchable)) {
            sourceWatchables.push(watchable);
          }
          return jotaiGet(watchable.asAtom());
        };

        const newValue = deriveFn(trackedGet);

        watchable.setLastUpdateTime(Date.now());

        return newValue;
      }) as WritableAtom<T, [T], unknown>;

    // For the initial call to establish dependencies
    deriveFn(get);

    return new Watchable<T>(derivedAtom, undefined, opts?.updater);
  }

  map<U>(cb: (t: T) => U): ReadonlyWatchable<U> {
    return Watchable.from((get) => cb(get(this)));
  }

  /**
   * Subscribe to changes to the watchable.
   * @param cb - The callback to call when the watchable changes.
   * @returns A function to unsubscribe from the watchable.
   */
  subscribe(cb: (t: T) => void): () => void {
    return store.sub(this._atom, () => cb(this.snapshot()));
  }

  snapshot() {
    return store.get(this._atom);
  }

  set(value: T) {
    const isEqualToPrevious = this._equalityFn?.(this.snapshot(), value);
    if (!isEqualToPrevious) {
      this.lastUpdateTime = Date.now();
      store.set(this._atom, this._updater?.(value));
    }
  }

  /**
   * Set the stored value without invoking the updater.
   * Use when syncing from an external source of truth (e.g. URL) that is already updated,
   * to avoid redundant side effects (e.g. writing back to the URL).
   */
  setFromSource(value: T) {
    const isEqualToPrevious = this._equalityFn?.(this.snapshot(), value);
    if (!isEqualToPrevious) {
      this.lastUpdateTime = Date.now();
      store.set(this._atom, value);
    }
  }

  asAtom(): Atom<T> {
    return this._atom;
  }

  private setLastUpdateTime(time: number) {
    this.lastUpdateTime = time;
  }
}

export type ReadonlyPollingWatchable<T> = ReadonlyWatchable<T> & {
  unsubscribe: () => void;
  restart: () => void;
};

export type WatchableGetter = <U>(w: ReadonlyWatchable<U>) => U;

export class PollingWatchable<T> extends Watchable<T> {
  private _timeoutId: ReturnType<typeof setTimeout> | undefined;
  private _subscribed = true;
  private _unsub: () => void;
  private _pollFn: (get: WatchableGetter) => Promise<T>;
  private _intervalMs: number;
  private _stopWhen: ((value: T) => boolean) | undefined;
  /** Incremented on each poll start; used to ignore stale responses from before restart() */
  private _pollGeneration = 0;

  protected constructor(
    baseAtom: (watchable: Watchable<T>) => WritableAtom<T, [T], unknown>,
    pollFn: (get: WatchableGetter) => Promise<T>,
    intervalMs: number,
    stopWhen?: (value: T) => boolean
  ) {
    super(baseAtom);

    this._pollFn = pollFn;
    this._intervalMs = intervalMs;
    this._stopWhen = stopWhen;

    this._runPollOnce();

    this._unsub = () => {
      this._subscribed = false;
      if (this._timeoutId !== undefined) {
        clearTimeout(this._timeoutId);
        this._timeoutId = undefined;
      }
    };
  }

  static create<T>(
    pollFn: (get: WatchableGetter) => Promise<T>,
    opts: {
      intervalMs: number;
      initialValue: T;
      stopWhen?: (value: T) => boolean;
    }
  ): ReadonlyPollingWatchable<T> {
    return new PollingWatchable<T>(
      () => atom(opts.initialValue),
      pollFn,
      opts.intervalMs,
      opts.stopWhen
    );
  }

  private _runPollOnce(): void {
    const generation = ++this._pollGeneration;
    const get: WatchableGetter = <U>(w: ReadonlyWatchable<U>): U =>
      store.get(w.asAtom()) as U;
    void this._pollFn(get)
      .then((value) => {
        if (!this._subscribed || generation !== this._pollGeneration) {
          return;
        }
        this.set(value);
        if (this._stopWhen?.(value) === true) {
          return;
        }
        this._scheduleNextPoll();
      })
      .catch(() => {
        if (this._subscribed && generation === this._pollGeneration) {
          this._scheduleNextPoll();
        }
      });
  }

  private _scheduleNextPoll(): void {
    if (!this._subscribed) {
      return;
    }
    this._timeoutId = setTimeout(() => {
      this._timeoutId = undefined;
      this._runPollOnce();
    }, this._intervalMs);
  }

  restart(): void {
    this._subscribed = true;
    if (this._timeoutId !== undefined) {
      clearTimeout(this._timeoutId);
      this._timeoutId = undefined;
    }

    this._runPollOnce();
  }

  unsubscribe() {
    this._unsub();
  }
}

type Storage<T> = {
  getItem: (key: string, defaultValue: T) => T;
  setItem: (key: string, value: T) => Promise<void>;
  subscribe: (key: string, listener: (value: T) => void) => () => void;
};

export class PersistentWatchable<T> extends Watchable<T> {
  constructor(
    baseAtom: (watchable: Watchable<T>) => WritableAtom<T, [T], unknown>,
    storage: Storage<T>,
    storageKey: string,
    equalityFn?: (a: T, b: T) => boolean,
    updater?: (value: T) => T
  ) {
    super(baseAtom, equalityFn ?? ((a, b) => a === b), (x) => {
      const next = updater?.(x) ?? x;
      void storage.setItem(storageKey, next);
      return next;
    });
  }

  static fromStorage<T>(props: {
    storage: Storage<T>;
    storageKey: string;
    defaultValue: T;
    map?: (value: T) => T;
    equalityFn?: (a: T, b: T) => boolean;
    updater?: (value: T) => T;
  }): PersistentWatchable<T> {
    const map = props.map ?? ((x) => x);
    return new PersistentWatchable<T>(
      (_) =>
        atom(map(props.storage.getItem(props.storageKey, props.defaultValue))),
      props.storage,
      props.storageKey,
      props.equalityFn,
      props.updater
    );
  }
}

export function useWatchableValue<T>(x: ReadonlyWatchable<T>): T {
  const [val] = useAtom(x.asAtom());
  return val;
}

export const useWatchableUpdatedAt = (x: ReadonlyWatchable<any>): number => {
  const [_val] = useAtom(x.asAtom());

  return x.lastUpdateTime;
};

export const JotaiProvider = ({ children }: { children: React.ReactNode }) => {
  return Provider({ store, children });
};

export class WatchableRecord<T extends Record<string, any>>
  implements ReadonlyWatchable<T>
{
  private _keysAtom: WritableAtom<string[], [string[]], unknown>;
  private _values: Map<string, Watchable<any>>;
  lastUpdateTime: number = Date.now();

  private constructor(initialValue: T) {
    // Create an atom to track the keys
    this._keysAtom = atom(Object.keys(initialValue));
    this._values = new Map();

    // Initialize watchables for each key
    Object.entries(initialValue).forEach(([key, value]) => {
      this._values.set(key, Watchable.fromValue(value));
    });
  }

  snapshot(): T {
    return Object.fromEntries(
      [...this._values.entries()].map(([key, value]) => [key, value.snapshot()])
    ) as T;
  }

  subscribe(cb: (t: T) => void): () => void {
    return store.sub(this._keysAtom, () => cb(this.snapshot()));
  }

  static fromValue<T extends Record<string, any>>(
    value: T
  ): WatchableRecord<T> {
    return new WatchableRecord<T>(value);
  }

  getItem<K extends keyof T>(key: K): Watchable<T[K]> {
    const watchable = this._values.get(key as string);
    if (!watchable) {
      throw new Error(`Key ${String(key)} not found in record`);
    }
    return watchable as Watchable<T[K]>;
  }

  setItem<K extends keyof T>(key: K, value: T[K]): void {
    const watchable = this._values.get(key as string);
    if (watchable) {
      watchable.set(value);
    } else {
      // New key
      this._values.set(key as string, Watchable.fromValue(value));
      const currentKeys = store.get(this._keysAtom);
      store.set(this._keysAtom, [...currentKeys, key as string]);
    }
    this.lastUpdateTime = Date.now();
  }

  map<U>(cb: (t: T) => U): ReadonlyWatchable<U> {
    return Watchable.from((get) => cb(get(this)));
  }

  delete<K extends keyof T>(key: K): void {
    if (this._values.has(key as string)) {
      this._values.delete(key as string);
      const currentKeys = store.get(this._keysAtom);
      store.set(
        this._keysAtom,
        currentKeys.filter((k) => k !== key)
      );
    }
    this.lastUpdateTime = Date.now();
  }

  asAtom(): Atom<T> {
    return atom((get) => {
      const keys = get(this._keysAtom);
      const result = {} as T;
      keys.forEach((key) => {
        const watchable = this._values.get(key);
        if (watchable) {
          result[key as keyof T] = get(watchable.asAtom());
        }
      });
      return result;
    });
  }

  // Get all current keys
  keys(): string[] {
    return store.get(this._keysAtom);
  }

  // Check if a key exists
  has<K extends keyof T>(key: K): boolean {
    return this._values.has(key as string);
  }
}

export type MixedSourceWatchable<T> = ReadonlyWatchable<T> & {
  set(value: T): void;
  unsubscribe(): void;
};

export type MixedSourceOptions<T> = {
  /**
   * When derived (streamed) value changes, only accept it if this returns true.
   * If false, keep the user's override. Use to reconcile: e.g. if streamed updatedAt
   * is older than lastUserEditTime, return false to preserve user edits.
   */
  shouldAcceptDerived?: (
    derived: T,
    override: T | null,
    lastUserEditTime: number,
    get: <U>(watchable: ReadonlyWatchable<U>) => U
  ) => boolean;
};

/**
 * A watchable that supports both derived and manual updates.
 * Derived updates (from dependency changes) take precedence over manual updates.
 * Manual updates persist until a dependency changes again.
 *
 * Value trace example: dep changes → derived value → user calls .set() → manual value → dep changes again → derived value
 *
 * With shouldAcceptDerived: when derived changes, override is kept if the callback returns false
 * (e.g. when streamed data is older than user's last edit).
 */
export class MixedSourceWatchableImpl<T> implements MixedSourceWatchable<T> {
  private _derivedAtom: Atom<T>;
  private _overrideAtom: WritableAtom<T | null, [T | null], unknown>;
  private _displayAtom: Atom<T>;
  private _unsubDerived: () => void;
  private _lastUserEditTime: number = 0;

  lastUpdateTime: number = Date.now();

  private constructor(
    deriveFn: (get: <U>(watchable: ReadonlyWatchable<U>) => U) => T,
    private readonly options?: MixedSourceOptions<T>
  ) {
    const sourceWatchables: ReadonlyWatchable<unknown>[] = [];

    const get = <U>(watchable: ReadonlyWatchable<U>): U => {
      if (!sourceWatchables.includes(watchable as ReadonlyWatchable<unknown>)) {
        sourceWatchables.push(watchable as ReadonlyWatchable<unknown>);
      }
      return store.get(watchable.asAtom());
    };

    // Establish initial dependencies
    deriveFn(get);

    this._overrideAtom = atom<T | null>(null);

    this._derivedAtom = atom((jotaiGet: Getter): T => {
      sourceWatchables.length = 0;
      const trackedGet = <U>(watchable: ReadonlyWatchable<U>): U => {
        if (
          !sourceWatchables.includes(watchable as ReadonlyWatchable<unknown>)
        ) {
          sourceWatchables.push(watchable as ReadonlyWatchable<unknown>);
        }
        return jotaiGet(watchable.asAtom());
      };
      return deriveFn(trackedGet);
    });

    this._displayAtom = atom((jotaiGet: Getter): T => {
      const override = jotaiGet(this._overrideAtom);
      if (override !== null) {
        return override;
      }
      return jotaiGet(this._derivedAtom);
    });

    // When derived value changes, optionally reconcile: only clear override if shouldAcceptDerived allows
    const read = <U>(watchable: ReadonlyWatchable<U>): U =>
      store.get(watchable.asAtom()) as U;
    this._unsubDerived = store.sub(this._derivedAtom, () => {
      const derived = store.get(this._derivedAtom);
      const override = store.get(this._overrideAtom);
      const shouldAccept =
        this.options?.shouldAcceptDerived === undefined ||
        this.options.shouldAcceptDerived(
          derived,
          override,
          this._lastUserEditTime,
          read
        );
      if (shouldAccept) {
        store.set(this._overrideAtom, null);
        this.lastUpdateTime = Date.now();
      }
    });
  }

  static from<T>(
    deriveFn: (get: <U>(watchable: ReadonlyWatchable<U>) => U) => T,
    options?: MixedSourceOptions<T>
  ): MixedSourceWatchable<T> {
    return new MixedSourceWatchableImpl<T>(deriveFn, options);
  }

  set(value: T): void {
    this._lastUserEditTime = Date.now();
    this.lastUpdateTime = Date.now();
    store.set(this._overrideAtom, value);
  }

  map<U>(cb: (t: T) => U): ReadonlyWatchable<U> {
    return Watchable.from((get) => cb(get(this)));
  }

  snapshot(): T {
    return store.get(this._displayAtom);
  }

  subscribe(cb: (t: T) => void): () => void {
    return store.sub(this._displayAtom, () => cb(this.snapshot()));
  }

  asAtom(): Atom<T> {
    return this._displayAtom;
  }

  unsubscribe(): void {
    this._unsubDerived();
  }
}

/** Factory for creating MixedSourceWatchables */
export const MixedSourceWatchable = {
  from: MixedSourceWatchableImpl.from,
};

export class StalenessWatchable {
  static forValue(
    value: ReadonlyWatchable<any>,
    deps: ReadonlyWatchable<any>[]
  ): ReadonlyWatchable<StaleState> {
    return Watchable.from((get) => {
      for (const dep of deps) {
        get(dep);
        get(value);
        if (dep.lastUpdateTime > value.lastUpdateTime) {
          return 'stale';
        }
      }
      return 'ok';
    });
  }
}
