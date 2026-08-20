import React, { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useModelScope } from './model-scope.context';
import type { Model, ModelConstructor } from './types';

function useRegisterModels<T extends Model>(
  create: () => T[],
  opts: {
    register: boolean;
    deps: any[];
  }
) {
  const scope = useModelScope();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memodModels = useMemo(create, opts.deps);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (opts.register) {
      scope.addModels(memodModels);
      memodModels.forEach((model) => {
        model.onCreate?.();
      });
    } else {
      // Remove any existing models that are no longer registered
      memodModels.forEach((model) => {
        if (
          scope.getModelOfType(
            model.constructor as ModelConstructor,
            model.id
          ) &&
          !opts.register
        ) {
          scope.removeModel(model.constructor as ModelConstructor, model.id);
        }
      });
    }

    setReady(true);

    return () => {
      // Cleanup by removing all models (removeModel calls dispose when ref count reaches 0)
      memodModels.forEach((model) => {
        scope.removeModel(model.constructor as ModelConstructor, model.id);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memodModels, opts.register]);

  return ready;
}

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

type ModelScopeProps = {
  models: Model[];
  children?: ReactNode;
};

/** Registers `models` into the surrounding scope for as long as this is mounted. */
export function ModelScope({ models, children }: ModelScopeProps) {
  const ready = useRegisterModels(() => models, {
    register: true,
    deps: [models],
  });

  if (!ready) {
    return null;
  }

  return <>{children}</>;
}

type ModelScopeFactoryProps = {
  createModels: () => Model[];
  deps: React.DependencyList;
  children?: ReactNode;
};

/**
 * Registers models created by a factory inside the effect. When the effect runs
 * (including on remount), fresh models are created. When cleanup runs, we dispose
 * those models. This avoids the "zombie model" problem where a disposed model
 * gets re-added to context after unmount/remount (e.g. React Strict Mode).
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
