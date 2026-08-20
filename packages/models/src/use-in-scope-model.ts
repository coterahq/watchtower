import { useEffect, useState } from 'react';
import { useModelScope } from './model-scope.context';
import { Model, ModelConstructor, TargetableModel } from './types';

type PropertyKeys<T> = {
  [K in keyof T]: T[K] extends Function ? never : K;
}[keyof T];

export type PropertiesOnly<T> = Pick<T, PropertyKeys<T>>;

/**
 * The nearest model of this type. Does not re-render when the set of models
 * changes — use {@link useStatefullyAwareInScopeModel} when the model may not
 * be registered yet.
 */
export const useInScopeModel = <T extends Model>(
  modelClass: ModelConstructor<T>,
  modelId?: string
): T => {
  const scope = useModelScope();

  return scope.getModelOfType<T>(modelClass, modelId) as T;
};

/** The targeted model of this type, re-reading whenever the scope changes. */
export const useTargetedModel = <T extends TargetableModel>(
  modelClass: ModelConstructor<T>
): T | null => {
  const scope = useModelScope();
  const [, setTick] = useState(0);

  useEffect(() => {
    return scope.subscribe(() => setTick((t) => t + 1));
  }, [scope]);

  return scope.targetedModelOfType(modelClass) ?? null;
};

/** Like {@link useInScopeModel}, but re-renders when the scope changes. */
export const useStatefullyAwareInScopeModel = <T extends Model>(
  modelClass: ModelConstructor<T>,
  modelId?: string
): T | null => {
  const scope = useModelScope();
  const [, setTick] = useState(0);

  useEffect(() => {
    return scope.subscribe(() => setTick((t) => t + 1));
  }, [scope]);

  return scope.getModelOfType(modelClass, modelId) ?? null;
};
