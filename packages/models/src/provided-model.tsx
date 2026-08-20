import {
  createContext,
  useContext,
  useEffect,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useModelScope } from './model-scope.context';
import { useInScopeModel, useTargetedModel } from './use-in-scope-model';
import { useModelTargetingActive } from './model-target-scope';
import type { ModelConstructor, TargetableModel } from './types';

/**
 * Provides a model instance via React context so editors bind to the correct
 * model when several of the same type share one actions scope — a page and an
 * artifact open beside it, say. Prefer this over
 * {@link useStatefullyAwareInScopeModel}: look the model up once after
 * {@link ModelScopeFactory} registers it, then descendants read the instance
 * from context.
 *
 * When `target` is true, the model is marked targeted so actions that use
 * `targetedModelOfType` / `hasTargetedModelOfType` resolve it — but only while
 * the surrounding {@link ModelTargetScope} says this subtree is the visible
 * one, so a hidden artifact releases targeting rather than holding it.
 */
export type ProvidedModelContext<T extends TargetableModel> = {
  Provider: (props: {
    modelId: string;
    /** When true, mark this model as the targeted one of its type. Default true. */
    target?: boolean;
    children: ReactNode;
  }) => ReactElement;
  useModel: () => T;
  /**
   * Like {@link useModel} but returns null instead of throwing when no model is
   * in scope. For components that are reused outside their owning page, where
   * the model-backed behaviour is an enhancement rather than a requirement.
   */
  useModelOrNull: () => T | null;
};

export function createProvidedModelContext<T extends TargetableModel>(
  modelClass: ModelConstructor<T>,
  notFoundMessage: string
): ProvidedModelContext<T> {
  const ModelContext = createContext<T | null>(null);

  const Provider = ({
    modelId,
    target = true,
    children,
  }: {
    modelId: string;
    target?: boolean;
    children: ReactNode;
  }): ReactElement => {
    const model = useInScopeModel(modelClass, modelId);
    const scope = useModelScope();
    const visible = useModelTargetingActive();

    useEffect(() => {
      if (target === true && visible) {
        scope.targetModel(model);
        return;
      }
      if (model.isTargeted === true) {
        scope.markAsNotTargeted(model);
      }
      // `visible` is a dep so switching artifact tabs hands targeting over;
      // without it, whichever mounted last would keep it forever.
    }, [scope, model, target, visible]);

    return (
      <ModelContext.Provider value={model}>{children}</ModelContext.Provider>
    );
  };

  const useModelOrNull = (): T | null => {
    const provided = useContext(ModelContext);
    const targeted = useTargetedModel(modelClass);
    return provided ?? targeted;
  };

  const useModel = (): T => {
    const model = useModelOrNull();
    if (model === null) {
      throw new Error(notFoundMessage);
    }
    return model;
  };

  return { Provider, useModel, useModelOrNull };
}
