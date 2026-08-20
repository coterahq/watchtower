import {
  type Action,
  type ActionPayload,
  type ActionResult,
  type ExecuteContext,
  type ActionTrackMetadata,
} from './types';

export type ActionTrackingContext<
  P extends ActionPayload,
  Errors extends { t: string }[]
> = {
  action: Action<P, Errors>;
  payload: P;
  context: ExecuteContext;
  result: ActionResult<Errors>;
};

export type ActionTrackingParams<
  P extends ActionPayload,
  Errors extends { t: string }[]
> = ActionTrackingContext<P, Errors> & {
  metadata?: ActionTrackMetadata | null;
};

export type ActionTrackingAdapter = {
  track: <P extends ActionPayload, Errors extends { t: string }[]>(
    params: ActionTrackingParams<P, Errors>
  ) => void;
};

export const noopAdapter: ActionTrackingAdapter = {
  track: () => {
    // noop
  },
};
