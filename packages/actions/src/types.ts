import { KeyName } from './use-keyboard-shortcuts';
import { Result } from 'neverthrow';
import { z } from 'zod';
import type {
  Model,
  ModelConstructor,
  TargetableModel,
} from '@cotera/watchtower-models';
import { ModelScopeManager } from '@cotera/watchtower-models';
import type {
  ActionTrackingAdapter,
  ActionTrackingContext,
  ActionTrackingParams,
} from './action-tracking';
import type { Logger } from './logger';

export type ActionPayload = Record<string, any>;

export type ActionTrackMetadata = {
  event?: string;
  properties?: Record<string, unknown>;
};

export type ActionResult<Errors extends { t: string }[]> = Result<
  {
    cancelled?: boolean;
    next?: boolean;
    /** Id of a created resource (e.g. from NewChatAction, NewAgentAction). */
    resourceId?: string;
    /**
     * What the action observed, for callers that need more than "it ran" —
     * currently the agent bridge, which sends this back to the model as the
     * tool result. Keep it small: it lands verbatim in the model's context.
     */
    output?: unknown;
  },
  Errors
>;

/**
 * Where an action is offered.
 *
 * `general` — the ordinary UI surfaces: command palette, shortcuts, buttons. It
 * is implied for every action, so it never has to be listed.
 * `chat` — Coco may call it. The action's own `title`, `description` and
 * `inputSchema` become the tool contract, so they have to read well to a model,
 * and it must not put a dialog in the way: an agent call arrives with a full
 * payload and nobody watching. Declare `shouldAsk(): false`, or provide no
 * `ask`. Opting in is the consent; there is no second prompt.
 * `discrete` — hidden from the palette (the long-standing `discrete` flag).
 */
export type ActionScope = 'chat' | 'general' | 'discrete';

export type ApplicableContext = Pick<
  FullActionsContext,
  | 'isInScope'
  | 'countInScopeModelsOfType'
  | 'getInScopeModelOfType'
  | 'getInScopeModelsOfType'
  | 'hasTargetedModelOfType'
  | 'targetedModelOfType'
  | 'getAllInScopeModels'
>;

export type ExecuteContext = Pick<
  FullActionsContext,
  | 'isInScope'
  | 'countInScopeModelsOfType'
  | 'getInScopeModelOfType'
  | 'getInScopeModelsOfType'
  | 'hasTargetedModelOfType'
  | 'targetedModelOfType'
  | 'getAction'
  | 'getAllInScopeModels'
  | 'isInScope'
  | 'hasTargetedModelOfType'
  | 'getAction'
  | 'addModels'
  | 'removeModel'
  | 'targetModel'
  | 'markAsNotTargeted'
  | 'track'
  | 'getTrackingAdapter'
  | 'getLogger'
>;

export type ReadActionsContext = Pick<
  FullActionsContext,
  | 'getAction'
  | 'getAllActions'
  | 'isInScope'
  | 'countInScopeModelsOfType'
  | 'getInScopeModelsOfType'
  | 'targetedModelOfType'
  | 'getAllInScopeModels'
  | 'getInScopeModelOfType'
  | 'hasTargetedModelOfType'
  | 'targetModel'
  | 'markAsNotTargeted'
  | 'removeTargetForType'
  | 'addModels'
  | 'removeModel'
  | 'dispatchEvent'
  | 'subscribe'
  | 'track'
  | 'getTrackingAdapter'
  | 'getLogger'
>;

export type Action<
  P extends ActionPayload = ActionPayload,
  Errors extends { t: string }[] = { t: string }[]
> = {
  title: string;
  shortcut?: KeyName[];
  /**
   * Whether the keyboard binding may claim this keystroke at all.
   *
   * Checked *before* the event is consumed, which is what separates it from
   * `applicable`: a matching shortcut has already had `preventDefault` called on
   * it by the time `applicable` runs, so an inapplicable action still swallows
   * the key. Harmless for a shortcut nothing else wants (Ctrl-S), not for one
   * the browser and every text field also use — a Cmd-C over selected text, a
   * Cmd-V into an input. Returning false leaves the event alone entirely.
   *
   * Absent means "always", which is every shortcut that has not opted in.
   */
  shortcutAvailable?: () => boolean;
  icon?: string;
  group?: string;
  inputSchema: z.ZodSchema<P>;
  description?: string;
  discrete?: boolean;
  events?: string[];
  /** Static priority for command palette ordering (higher = more prominent). */
  priority?: number;
  /** Context-dependent priority; used when present instead of priority when sorting. */
  getPriority?: (context: ApplicableContext) => number;
  /**
   * Surfaces this action is offered on; see {@link ActionScope}. Absent means
   * `general` only, which is every action that has not opted into anything.
   */
  scopes?: ActionScope[];
  /**
   * Describes the action against what is actually on screen, for the `chat`
   * scope. Exists because `description` is static while the thing being acted
   * on is not — naming the concrete subjects and their ids is what lets a model
   * address one explicitly instead of relying on whichever is targeted.
   * Returning null falls back to `description`.
   */
  describeForAgent?: (context: ApplicableContext) => string | null;

  applicable: (context: ApplicableContext) => boolean;

  askOrExecute: (
    payload: Partial<P>,
    context: ExecuteContext
  ) => Promise<ActionResult<Errors>> | ActionResult<Errors>;

  requiresInputArgs(): boolean;

  ask?: (params: Partial<P>, context: ExecuteContext) => AskResponse<P, Errors>;

  shouldAsk?: (context: ApplicableContext) => boolean;

  track?: (
    params: ActionTrackingContext<P, Errors>
  ) => ActionTrackMetadata | null;
};

export type ActionConstructor<
  P extends ActionPayload,
  T extends Action<P> = Action<P>
> = {
  new (...args: any[]): T;
  readonly actionId?: string;
};

export type FullActionsContext = {
  getAction: <P extends ActionPayload>(
    actionConstructor: ActionConstructor<P>
  ) => Action<P>;
  getAllActions: () => Action[];
  getModelScope: () => ModelScopeManager;
  registerAction: (action: Action) => void;
  unregisterAction: (action: Action) => void;
  isInScope: (modelConstructor: ModelConstructor) => boolean;
  countInScopeModelsOfType: <T extends Model>(
    modelConstructor: ModelConstructor<T>
  ) => number;
  getInScopeModelsOfType: <T extends Model>(
    modelConstructor: ModelConstructor<T>
  ) => T[];
  targetedModelOfType: <T extends TargetableModel>(
    modelConstructor: ModelConstructor<T>
  ) => T | null;
  hasTargetedModelOfType: <T extends TargetableModel>(
    modelConstructor: ModelConstructor<T>
  ) => boolean;
  targetModel: <T extends TargetableModel>(model: T) => void;
  markAsNotTargeted: <T extends TargetableModel>(model: T) => void;
  removeTargetForType: <T extends TargetableModel>(
    model: ModelConstructor<T>
  ) => void;
  getAllInScopeModels: () => Model[];
  getInScopeModelOfType: <T extends Model>(
    modelConstructor: ModelConstructor<T>,
    id?: string
  ) => T | null;
  addModels: (models: Model[]) => Model[];
  removeModel: (modelConstructor: ModelConstructor, modelId: string) => void;
  clearModels: () => void;
  subscribe(callback: (models: Model[]) => void): () => void;
  dispatchEvent: (event: CustomEvent) => void;
  track: <P extends ActionPayload, Errors extends { t: string }[]>(
    params: ActionTrackingParams<P, Errors>
  ) => void;
  getTrackingAdapter: () => ActionTrackingAdapter;
  getLogger: () => Logger;
};

export type AskViewType<
  T,
  Errors extends { t: string }[] = { t: string }[]
> = (params: {
  onRespond: (params: T) => void | Promise<ActionResult<Errors>>;
  onCancel: () => void | Promise<void>;
}) => void;

export type AskResponse<T, Errors extends { t: string }[] = { t: string }[]> = {
  view: AskViewType<T, Errors>;
};
