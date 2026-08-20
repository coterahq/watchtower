import type {
  QueryClient,
  QueryKey,
  QueryObserverOptions,
  QueryObserverResult,
} from '@tanstack/react-query';
import { QueryObserver } from '@tanstack/react-query';
import { atom, WritableAtom } from 'jotai';
import { Watchable, type ReadonlyWatchable } from '@cotera/watchtower';

export type ReadonlyQueryWatchable<
  TData = unknown,
  TError = Error
> = ReadonlyWatchable<QueryObserverResult<TData, TError>> & {
  unsubscribe(): void;
};

export type QueryWatchableOptions<TData = unknown, TError = Error> = Pick<
  QueryObserverOptions<unknown, TError, TData, unknown, QueryKey>,
  'queryKey'
> &
  Partial<
    Pick<
      QueryObserverOptions<unknown, TError, TData, unknown, QueryKey>,
      'select' | 'enabled'
    >
  >;

/**
 * Watchable that stays in sync with a TanStack Query cache entry for the given query key.
 * Uses QueryObserver under the hood; call unsubscribe() when done to release the observer.
 */
export class QueryWatchableImpl<TData = unknown, TError = Error>
  extends Watchable<QueryObserverResult<TData, TError>>
  implements ReadonlyQueryWatchable<TData, TError>
{
  private _unsub: () => void;

  private constructor(
    baseAtom: (
      watchable: Watchable<QueryObserverResult<TData, TError>>
    ) => WritableAtom<
      QueryObserverResult<TData, TError>,
      [QueryObserverResult<TData, TError>],
      unknown
    >,
    getUnsub: (w: Watchable<QueryObserverResult<TData, TError>>) => () => void
  ) {
    super(baseAtom);
    this._unsub = getUnsub(this);
  }

  static for<TData = unknown, TError = Error>(
    queryClient: QueryClient,
    options: QueryWatchableOptions<TData, TError>
  ): ReadonlyQueryWatchable<TData, TError> {
    const { queryKey, ...rest } = options;
    const observer = new QueryObserver(queryClient, {
      queryKey,
      ...rest,
    });
    const initialResult = observer.getCurrentResult();
    return new QueryWatchableImpl<TData, TError>(
      () => atom(initialResult),
      (w) => observer.subscribe((result) => w.set(result))
    );
  }

  unsubscribe(): void {
    this._unsub();
  }
}

export const QueryWatchable = {
  for: QueryWatchableImpl.for,
};
