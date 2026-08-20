import { describe, it, expect, vi } from 'vitest';
import { Watchable, type WatchableGetter } from '@cotera/watchtower';
import { EventWatchable } from './event-watchable';

describe(EventWatchable.for.name, () => {
  it('gives fn a get that reads the current value of another watchable', async () => {
    const filter = Watchable.fromValue('a');
    const fn = vi.fn(async (_payload: unknown, get: WatchableGetter) =>
      get(filter)
    );

    let emit!: (payload?: unknown) => void;
    const subscribe = vi.fn((_event: string, cb: (p?: unknown) => void) => {
      emit = cb;
      return () => {};
    });

    const watchable = EventWatchable.for<string>({
      event: 'test',
      initialValue: '',
      fn,
      subscribe,
    });

    await vi.waitFor(() => expect(watchable.snapshot()).toBe('a'));

    filter.set('b');
    emit();

    await vi.waitFor(() => expect(watchable.snapshot()).toBe('b'));
    watchable.unsubscribe();
  });

  it('ignores stale results when concurrent refreshes complete out of order', async () => {
    const delays: Record<string, number> = {
      first: 50,
      second: 20,
      third: 10,
    };
    const fn = vi.fn(
      (payload: { id: string } | undefined, _get: WatchableGetter) => {
        const id = payload?.id ?? 'mount';
        const delay = delays[id] ?? 0;
        return new Promise<string>((resolve) =>
          setTimeout(() => resolve(id), delay)
        );
      }
    );

    let emit: (payload: { id: string }) => void;
    const subscribe = vi.fn((_event: string, cb: (p?: unknown) => void) => {
      emit = cb;
      return () => {};
    });

    const watchable = EventWatchable.for<string, { id: string }>({
      event: 'test',
      initialValue: '',
      runOnMount: true,
      fn,
      subscribe,
    });

    await new Promise((r) => setTimeout(r, 0));
    expect(watchable.snapshot()).toBe('mount');

    emit!({ id: 'first' });
    emit!({ id: 'second' });
    emit!({ id: 'third' });

    await new Promise((r) => setTimeout(r, 60));

    expect(watchable.snapshot()).toBe('third');
    watchable.unsubscribe();
  });

  it('serializes refreshes and keeps only the latest queued payload', async () => {
    const resolvers: Array<() => void> = [];
    const fn = vi.fn(
      (payload: { id: string } | undefined, _get: WatchableGetter) =>
        new Promise<string>((resolve) => {
          resolvers.push(() => resolve(payload?.id ?? 'mount'));
        })
    );

    let emit: (payload: { id: string }) => void;
    const subscribe = vi.fn((_event: string, cb: (p?: unknown) => void) => {
      emit = cb;
      return () => {};
    });

    const watchable = EventWatchable.for<string, { id: string }>({
      event: 'test',
      initialValue: '',
      runOnMount: false,
      fn,
      subscribe,
      serializeRefreshes: true,
    });

    emit!({ id: 'first' });
    emit!({ id: 'second' });
    emit!({ id: 'third' });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenNthCalledWith(
      1,
      { id: 'first' },
      expect.any(Function)
    );

    resolvers[0]?.();
    await new Promise((r) => setTimeout(r, 0));

    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenNthCalledWith(
      2,
      { id: 'third' },
      expect.any(Function)
    );

    resolvers[1]?.();
    await new Promise((r) => setTimeout(r, 0));

    expect(watchable.snapshot()).toBe('third');
    watchable.unsubscribe();
  });

  it('keeps only the latest queued trigger while a serialized discard refresh is in flight', async () => {
    const resolvers: Array<() => void> = [];
    const fn = vi.fn(
      (payload: { id: string } | undefined, _get: WatchableGetter) =>
        new Promise<string>((resolve) => {
          resolvers.push(() => resolve(payload?.id ?? 'mount'));
        })
    );

    let emit: (payload: { id: string }) => void;
    const subscribe = vi.fn((_event: string, cb: (p?: unknown) => void) => {
      emit = cb;
      return () => {};
    });

    const watchable = EventWatchable.for<string, { id: string }>({
      event: 'test',
      initialValue: '',
      runOnMount: false,
      fn,
      subscribe,
      serializeRefreshes: true,
      serializeQueueStrategy: 'discard',
    });

    emit!({ id: 'first' });
    emit!({ id: 'second' });
    emit!({ id: 'third' });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenNthCalledWith(
      1,
      { id: 'first' },
      expect.any(Function)
    );

    resolvers[0]?.();
    await new Promise((r) => setTimeout(r, 0));

    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenNthCalledWith(
      2,
      { id: 'third' },
      expect.any(Function)
    );

    resolvers[1]?.();
    await new Promise((r) => setTimeout(r, 0));

    expect(watchable.snapshot()).toBe('third');
    watchable.unsubscribe();
  });

  describe('fallback polling', () => {
    const noopSubscribe = (_event: string, _cb: (p?: unknown) => void) => () =>
      undefined;

    /** Drives the connection-status callback the way the broadcast bus does. */
    const connectionStatusHarness = () => {
      let notify: (connected: boolean) => void = () => undefined;
      return {
        subscribeToConnectionStatus: (cb: (connected: boolean) => void) => {
          notify = cb;
          // The real bus replays current state (false until the socket opens).
          cb(false);
          return () => undefined;
        },
        set: (connected: boolean) => notify(connected),
      };
    };

    it('does not poll while the push stream is connected', async () => {
      const conn = connectionStatusHarness();
      const fallbackFn = vi.fn(async () => 'polled');

      const watchable = EventWatchable.for<string>({
        event: 'test',
        initialValue: '',
        runOnMount: false,
        fn: async () => 'event',
        subscribe: noopSubscribe,
        subscribeToConnectionStatus: conn.subscribeToConnectionStatus,
        fallback: { fn: fallbackFn, interval: 10 },
      });

      conn.set(true);
      await new Promise((r) => setTimeout(r, 40));

      expect(fallbackFn).not.toHaveBeenCalled();
      watchable.unsubscribe();
    });

    it('polls while the push stream is down', async () => {
      const conn = connectionStatusHarness();
      const fallbackFn = vi.fn(async () => 'polled');

      const watchable = EventWatchable.for<string>({
        event: 'test',
        initialValue: '',
        runOnMount: false,
        fn: async () => 'event',
        subscribe: noopSubscribe,
        subscribeToConnectionStatus: conn.subscribeToConnectionStatus,
        fallback: { fn: fallbackFn, interval: 10 },
      });

      await new Promise((r) => setTimeout(r, 45));

      expect(fallbackFn.mock.calls.length).toBeGreaterThan(0);
      expect(watchable.snapshot()).toBe('polled');
      watchable.unsubscribe();
    });

    it('stops polling once the push stream reconnects', async () => {
      const conn = connectionStatusHarness();
      const fallbackFn = vi.fn(async () => 'polled');

      const watchable = EventWatchable.for<string>({
        event: 'test',
        initialValue: '',
        runOnMount: false,
        fn: async () => 'event',
        subscribe: noopSubscribe,
        subscribeToConnectionStatus: conn.subscribeToConnectionStatus,
        fallback: { fn: fallbackFn, interval: 10 },
      });

      await new Promise((r) => setTimeout(r, 45));
      expect(fallbackFn.mock.calls.length).toBeGreaterThan(0);

      conn.set(true);
      const callsAtReconnect = fallbackFn.mock.calls.length;

      await new Promise((r) => setTimeout(r, 60));

      expect(fallbackFn.mock.calls.length).toBe(callsAtReconnect);
      watchable.unsubscribe();
    });

    it('stops polling when a reconnect lands mid-fetch', async () => {
      const conn = connectionStatusHarness();
      let releaseFetch: (() => void) | undefined;
      const fallbackFn = vi.fn(
        () =>
          new Promise<string>((resolve) => {
            releaseFetch = () => resolve('polled');
          })
      );

      const watchable = EventWatchable.for<string>({
        event: 'test',
        initialValue: '',
        runOnMount: false,
        fn: async () => 'event',
        subscribe: noopSubscribe,
        subscribeToConnectionStatus: conn.subscribeToConnectionStatus,
        fallback: { fn: fallbackFn, interval: 10 },
      });

      // Let exactly one poll start, then reconnect before it settles.
      await new Promise((r) => setTimeout(r, 15));
      expect(fallbackFn).toHaveBeenCalledTimes(1);

      conn.set(true);
      releaseFetch?.();
      await new Promise((r) => setTimeout(r, 60));

      // `finally` must not resurrect the loop on a healthy socket.
      expect(fallbackFn).toHaveBeenCalledTimes(1);
      watchable.unsubscribe();
    });

    it('does not stack parallel loops on repeated disconnects', async () => {
      const conn = connectionStatusHarness();
      const fallbackFn = vi.fn(async () => 'polled');

      const watchable = EventWatchable.for<string>({
        event: 'test',
        initialValue: '',
        runOnMount: false,
        fn: async () => 'event',
        subscribe: noopSubscribe,
        subscribeToConnectionStatus: conn.subscribeToConnectionStatus,
        fallback: { fn: fallbackFn, interval: 20 },
      });

      // Three disconnects in a row must leave one loop, not three.
      conn.set(false);
      conn.set(false);

      await new Promise((r) => setTimeout(r, 50));

      expect(fallbackFn.mock.calls.length).toBeLessThanOrEqual(2);
      watchable.unsubscribe();
    });

    it('stops polling after unsubscribe', async () => {
      const conn = connectionStatusHarness();
      const fallbackFn = vi.fn(async () => 'polled');

      const watchable = EventWatchable.for<string>({
        event: 'test',
        initialValue: '',
        runOnMount: false,
        fn: async () => 'event',
        subscribe: noopSubscribe,
        subscribeToConnectionStatus: conn.subscribeToConnectionStatus,
        fallback: { fn: fallbackFn, interval: 10 },
      });

      await new Promise((r) => setTimeout(r, 25));
      watchable.unsubscribe();
      const callsAtUnsubscribe = fallbackFn.mock.calls.length;

      await new Promise((r) => setTimeout(r, 50));

      expect(fallbackFn.mock.calls.length).toBe(callsAtUnsubscribe);
    });
  });
});
