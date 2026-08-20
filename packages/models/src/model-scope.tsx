import React, { useEffect, useState, type ReactNode } from 'react';
import { useModelScope } from './model-scope.context';
import type { Model, ModelConstructor } from './types';

/**
 * Registers models created by a factory inside the effect. When the effect runs
 * (including on remount), fresh models are created. When cleanup runs, we dispose
 * those models. This avoids the "zombie model" problem where a disposed model
 * gets re-added to context after unmount/remount (e.g. React Strict Mode).
 */
function useRegisterModelsFromFactory<T extends Model>(
  createModels: () => T[],
  deps: React.DependencyList
) {
  const scope = useModelScope();

  const [ready, setReady] = useState(false);

  useEffect(() => {
    const rawModels = createModels();
    const models = scope.addModels(rawModels);
    rawModels.forEach((raw, i) => {
      if (models[i] !== raw) {
        raw.dispose?.();
      } else {
        raw.onCreate?.();
      }
    });
    setReady(true);

    return () => {
      setReady(false);
      models.forEach((model) => {
        scope.removeModel(model.constructor as ModelConstructor, model.id);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ready;
}

type ModelScopeFactoryProps = {
  createModels: () => Model[];
  deps: React.DependencyList;
  children?: ReactNode;
};

/**
 * Registers the models a factory creates for as long as this is mounted.
 *
 * The factory runs *inside* the effect, and `deps` — not the identity of the
 * models themselves — decides when it re-runs. That is what makes this the only
 * scope component: a `models={[model]}` prop would take a fresh array on every
 * render and re-register on every render, and holding instances created outside
 * the effect means a remount re-registers models that were already disposed.
 *
 * Pass the values the models are built from as `deps`, the same as `useMemo`:
 *
 * ```tsx
 * <ModelScopeFactory createModels={() => [new RunModel(runKey)]} deps={[runKey]}>
 *   <RunTitle />
 * </ModelScopeFactory>
 * ```
 */
export function ModelScopeFactory({
  createModels,
  deps,
  children,
}: ModelScopeFactoryProps) {
  const ready = useRegisterModelsFromFactory(createModels, deps);

  if (!ready) {
    return null;
  }

  return <>{children}</>;
}
