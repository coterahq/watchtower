import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { ModelScopeManager } from './model-scope.manager';

const ModelScopeContext = createContext<ModelScopeManager | null>(null);

/**
 * Makes a {@link ModelScopeManager} available to the subtree.
 *
 * Pass `scope` to share a registry that something else owns — this is how
 * `ActionsRegistryProvider` hands over the scope its actions read from. Omit it
 * and the provider creates one, parented to the nearest enclosing scope so
 * lookups still walk up.
 */
export const ModelScopeProvider: React.FC<{
  scope?: ModelScopeManager;
  children: ReactNode;
}> = ({ scope, children }) => {
  const parent = useContext(ModelScopeContext);

  const value = useMemo(
    () => scope ?? ModelScopeManager.create(parent ?? undefined),
    [scope, parent]
  );

  useEffect(() => {
    if (scope !== undefined) {
      // Someone else owns it and will dispose of it.
      return;
    }
    return () => value.dispose();
  }, [scope, value]);

  return (
    <ModelScopeContext.Provider value={value}>
      {children}
    </ModelScopeContext.Provider>
  );
};

/** The nearest model scope. Throws when there is none. */
export const useModelScope = (): ModelScopeManager => {
  const scope = useContext(ModelScopeContext);
  if (scope === null) {
    throw new Error(
      'useModelScope must be used within a ModelScopeProvider (or an ActionsRegistryProvider, which provides one)'
    );
  }
  return scope;
};

/** The nearest model scope, or null when there is none. */
export const useModelScopeOrNull = (): ModelScopeManager | null =>
  useContext(ModelScopeContext);
