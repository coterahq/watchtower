import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { Watchable, type WatchableGetter } from '@cotera/watchtower';
import { QueryClientEventWatchable } from './query-client-event-watchable';

describe(QueryClientEventWatchable.for.name, () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invalidates configured prefixes only after an event payload (not on mount)', async () => {
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    let emit!: (payload?: unknown) => void;
    const subscribe = vi.fn((_event: string, cb: (p?: unknown) => void) => {
      emit = cb;
      return () => {};
    });

    const userFn = vi.fn(
      async (_payload: unknown, _get: WatchableGetter): Promise<number> => 42
    );

    const w = QueryClientEventWatchable.for<number, unknown>({
      queryClient: qc,
      queryKeys: [
        ['org-a', 'kind', 'x'],
        ['org-a', 'kind', 'y'],
      ],
      event: 'ev',
      runOnMount: true,
      initialValue: 0,
      fn: userFn,
      subscribe,
    });

    await vi.waitFor(() => {
      expect(userFn).toHaveBeenCalled();
      expect(w.snapshot()).toBe(42);
    });

    expect(invalidateSpy).not.toHaveBeenCalled();

    invalidateSpy.mockClear();
    userFn.mockClear();

    emit({});

    await vi.waitFor(() => {
      expect(userFn).toHaveBeenCalledTimes(1);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['org-a', 'kind', 'x'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['org-a', 'kind', 'y'],
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(2);

    w.unsubscribe();
  });

  it('treats a single prefix tuple as one key (event only)', async () => {
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    let emit!: (p?: unknown) => void;
    const subscribe = vi.fn((_event: string, cb: (p?: unknown) => void) => {
      emit = cb;
      return () => {};
    });

    const fn = vi.fn(async () => 1);
    const w = QueryClientEventWatchable.for<number, unknown>({
      queryClient: qc,
      queryKeys: ['org-b', 'one', 'slice'],
      event: 'e2',
      runOnMount: true,
      initialValue: -1,
      fn,
      subscribe,
    });

    await vi.waitFor(() => {
      expect(fn).toHaveBeenCalledTimes(1);
    });

    expect(invalidateSpy).not.toHaveBeenCalled();

    emit({});

    await vi.waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledTimes(1);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['org-b', 'one', 'slice'],
    });

    w.unsubscribe();
  });

  it('resolves dynamic queryKeys using watchable state', async () => {
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const scope = Watchable.fromValue<'private' | 'shared' | undefined>(
      undefined
    );
    let emit!: (p?: unknown) => void;
    const subscribe = vi.fn((_event: string, cb: (p?: unknown) => void) => {
      emit = cb;
      return () => {};
    });

    const w = QueryClientEventWatchable.for<number, unknown>({
      queryClient: qc,
      event: 'ev-dynamic',
      runOnMount: false,
      initialValue: 0,
      queryKeys: (get) => {
        const currentScope = get(scope);
        return [
          'org-d',
          'resource',
          'listPage',
          'folder',
          ...(currentScope !== undefined ? [currentScope] : []),
        ];
      },
      fn: async () => 0,
      subscribe,
    });

    emit({});
    await vi.waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['org-d', 'resource', 'listPage', 'folder'],
      });
    });

    invalidateSpy.mockClear();
    scope.set('shared');
    emit({});

    await vi.waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['org-d', 'resource', 'listPage', 'folder', 'shared'],
      });
    });

    w.unsubscribe();
  });

  it('recomputes dynamic queryKeys when dependent watchables change', async () => {
    const qc = new QueryClient();
    const scope = Watchable.fromValue<'private' | 'shared' | undefined>(
      undefined
    );
    const resolver = vi.fn((get: WatchableGetter) => {
      const currentScope = get(scope);
      return [
        'org-e',
        'resource',
        'listPage',
        'folder',
        ...(currentScope !== undefined ? [currentScope] : []),
      ];
    });

    const w = QueryClientEventWatchable.for<number, unknown>({
      queryClient: qc,
      event: 'ev-dynamic-recompute',
      runOnMount: false,
      initialValue: 0,
      queryKeys: resolver,
      fn: async () => 0,
      subscribe: () => () => {},
    });

    const callsBefore = resolver.mock.calls.length;
    expect(callsBefore).toBeGreaterThan(0);

    scope.set('private');
    await vi.waitFor(() => {
      expect(resolver.mock.calls.length).toBeGreaterThan(callsBefore);
    });

    w.unsubscribe();
  });

  it('runs without queryKeys', async () => {
    const qc = new QueryClient();
    let emit!: (p?: unknown) => void;
    const subscribe = vi.fn((_e: string, cb: (p?: unknown) => void) => {
      emit = cb;
      return () => {};
    });
    const fn = vi.fn(async (_payload: unknown) => 0);

    const w = QueryClientEventWatchable.for<number, unknown>({
      queryClient: qc,
      event: 'ev-extra',
      runOnMount: false,
      initialValue: 0,
      equalityFn: () => true,
      fn,
      subscribe,
    });

    emit({});
    await vi.waitFor(() => {
      expect(fn).toHaveBeenCalled();
    });

    w.unsubscribe();
  });
});
