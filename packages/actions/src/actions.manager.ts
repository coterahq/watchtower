import { err, ok } from 'neverthrow';
import {
  ModelScopeManager,
  type Model,
  type ModelConstructor,
  type TargetableModel,
} from '@cotera/watchtower-models';
import {
  Action,
  ActionConstructor,
  ActionPayload,
  FullActionsContext,
} from './types';
import {
  ActionTrackingAdapter,
  ActionTrackingContext,
  noopAdapter,
} from './action-tracking';
import { ConsoleLogger, Logger } from './logger';

const defaultLogger = new ConsoleLogger();

export class ActionsManager implements FullActionsContext {
  private actions: Map<string, Action> = new Map();
  /**
   * How many live mounts registered each action key. Multiple same-type artifacts
   * (e.g. two agent editors open in one chat) each register `SaveAgentAction` into
   * the shared scope; without refcounting, the first sibling to unmount would delete
   * the key for everyone still open and later `getAction` calls would throw. We only
   * drop the action when the last registrant unregisters.
   */
  private actionRefCounts: Map<string, number> = new Map();
  private modelScope: ModelScopeManager;
  private trackingAdapter: ActionTrackingAdapter;
  private logger: Logger;

  constructor(
    actions: Action<any>[] = [],
    opts: {
      parentModelScope?: ModelScopeManager;
      trackingAdapter?: ActionTrackingAdapter;
      logger?: Logger;
    } = {}
  ) {
    this.registerMany(actions);
    this.modelScope = ModelScopeManager.create(opts.parentModelScope);
    this.trackingAdapter = opts.trackingAdapter ?? noopAdapter;
    this.logger = opts.logger ?? defaultLogger;
  }

  static fromExisting = (
    context: Pick<
      FullActionsContext,
      | 'getAllActions'
      | 'getAllInScopeModels'
      | 'getTrackingAdapter'
      | 'getLogger'
    >,
    opts: {
      trackingAdapter?: ActionTrackingAdapter;
      logger?: Logger;
    } = {}
  ) => {
    // Extract tracking adapter from context if it's an ActionsManager instance
    let trackingAdapter = opts.trackingAdapter;
    if (!trackingAdapter) {
      trackingAdapter = context.getTrackingAdapter();
    }

    // Extract logger from context if it's an ActionsManager instance
    let logger = opts.logger;
    if (!logger && 'getLogger' in context) {
      logger = context.getLogger();
    }

    if (!logger) {
      throw new Error(
        'Logger is required. Provide logger in opts or ensure context has getLogger.'
      );
    }

    const manager = new ActionsManager(context.getAllActions(), {
      trackingAdapter: trackingAdapter ?? noopAdapter,
      logger,
    });

    manager.addModels(context.getAllInScopeModels());

    return manager;
  };

  static fromModels = (
    context: Pick<
      FullActionsContext,
      'getAllActions' | 'getTrackingAdapter' | 'getLogger'
    >,
    models: Model[],
    opts: {
      trackingAdapter?: ActionTrackingAdapter;
      logger?: Logger;
    } = {}
  ) => {
    // Extract tracking adapter from context if it's an ActionsManager instance
    let trackingAdapter = opts.trackingAdapter;
    if (!trackingAdapter) {
      trackingAdapter = context.getTrackingAdapter();
    }

    // Extract logger from context if it's an ActionsManager instance
    let logger = opts.logger;
    if (!logger && 'getLogger' in context) {
      logger = context.getLogger();
    }

    if (!logger) {
      throw new Error(
        'Logger is required. Provide logger in opts or ensure context has getLogger.'
      );
    }

    const manager = new ActionsManager(context.getAllActions(), {
      trackingAdapter: trackingAdapter ?? noopAdapter,
      logger,
    });

    manager.addModels(models);

    return manager;
  };

  private static actionKeyForConstructor(
    constructor: ActionConstructor<any> | Function
  ): string {
    return (constructor as ActionConstructor<any>).actionId ?? constructor.name;
  }

  registerAction = <P extends ActionPayload>(action: Action<P>): void => {
    const key = ActionsManager.actionKeyForConstructor(action.constructor);
    // Last registrant wins as the live instance (matches prior behavior); the
    // refcount just keeps the key alive until every registrant unregisters.
    this.actions.set(key, action as Action<ActionPayload>);
    this.actionRefCounts.set(key, (this.actionRefCounts.get(key) ?? 0) + 1);
  };

  unregisterAction = (action: Action): void => {
    const key = ActionsManager.actionKeyForConstructor(action.constructor);
    const remaining = (this.actionRefCounts.get(key) ?? 1) - 1;
    if (remaining > 0) {
      this.actionRefCounts.set(key, remaining);
      return;
    }
    this.actionRefCounts.delete(key);
    this.actions.delete(key);
  };

  registerMany = <P extends ActionPayload>(actions: Action<P>[]): void => {
    actions.forEach((action) => this.registerAction(action));
  };

  unregister = <P extends ActionPayload>(
    actionConstructor: ActionConstructor<P>
  ): void => {
    const key = ActionsManager.actionKeyForConstructor(actionConstructor);
    this.actionRefCounts.delete(key);
    this.actions.delete(key);
  };

  getAction = <P extends ActionPayload>(
    actionConstructor: ActionConstructor<P>
  ): Action<P> => {
    const key = ActionsManager.actionKeyForConstructor(actionConstructor);
    const action = this.actions.get(key) as Action<P>;

    return action;
  };

  setModels = (models: Model[]): void => {
    this.modelScope.setModels(models);
  };

  addModel = <T extends Model>(model: T): T => {
    return this.modelScope.addModel(model);
  };

  addModels = (models: Model[]): Model[] => {
    return this.modelScope.addModels(models);
  };

  removeModel = (type: ModelConstructor, modelId: string): void => {
    this.modelScope.removeModel(type, modelId);
  };

  clearModels = (): void => {
    this.modelScope.clearScope();
  };

  getAllActions = (): Action[] => {
    return Array.from(this.actions.values());
  };

  getModelScope = (): ModelScopeManager => {
    return this.modelScope;
  };

  getTrackingAdapter = (): ActionTrackingAdapter => {
    return this.trackingAdapter;
  };

  /**
   * Get a single model of a given type in the scope that is targeted.
   */
  targetModel = <T extends TargetableModel>(model: T) => {
    this.modelScope.targetModel(model);
  };

  targetedModelOfType = <T extends TargetableModel>(
    type: ModelConstructor<T>
  ): T | null => {
    return this.modelScope.targetedModelOfType(type);
  };

  hasTargetedModelOfType = <T extends TargetableModel>(
    type: ModelConstructor<T>
  ): boolean => {
    return this.modelScope.hasTargetedModelOfType(type);
  };

  markAsNotTargeted = <T extends TargetableModel>(model: T): void => {
    this.modelScope.markAsNotTargeted(model);
  };

  removeTargetForType = <T extends TargetableModel>(
    model: ModelConstructor<T>
  ): void => {
    this.modelScope.removeTargetForType(model);
  };

  isInScope = <T extends Model>(
    modelConstructor: ModelConstructor<T>,
    id?: string
  ): boolean => {
    return this.modelScope.isInScope(modelConstructor, id);
  };

  countInScopeModelsOfType = <T extends Model>(
    modelConstructor: ModelConstructor<T>
  ): number => {
    return this.modelScope.countInScopeModelsOfType(modelConstructor);
  };

  getInScopeModelsOfType = <T extends Model>(
    modelConstructor: ModelConstructor<T>
  ): T[] => {
    return this.modelScope.getInScopeModelsOfType(modelConstructor);
  };

  getAllInScopeModels = (): Model[] => {
    return this.modelScope.getAllInScopeModels();
  };

  getInScopeModelOfType = <T extends Model>(
    modelConstructor: ModelConstructor<T>,
    id?: string
  ): T | null => {
    return this.modelScope.getModelOfType(modelConstructor, id);
  };

  subscribe = (callback: (models: Model[]) => void): (() => void) => {
    return this.modelScope.subscribe(callback);
  };

  notify = () => {
    this.modelScope.notify();
  };

  dispatchEvent = (event: CustomEvent) => {
    const eventConfigs = Array.from(this.actions.values()).filter((action) =>
      action.events?.includes(event.type)
    );

    if (eventConfigs.length === 0) {
      return err({
        t: 'no_action_found_for_event',
        message: `No action found for event: ${event.type}`,
      });
    }

    window.dispatchEvent(event);

    return ok({});
  };

  track = (params: ActionTrackingContext<any, any>): void => {
    this.trackingAdapter.track(params);
  };

  getLogger = (): Logger => {
    return this.logger;
  };
}
