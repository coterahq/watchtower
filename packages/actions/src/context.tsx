import React, {
  createContext,
  useContext,
  ReactNode,
  useEffect,
  useMemo,
} from 'react';
import { useKeyboardShortcuts } from './use-keyboard-shortcuts';
import {
  ModelScopeManager,
  ModelScopeProvider,
} from '@cotera/watchtower-models';
import { ActionsManager } from './actions.manager';
import {
  ActionConstructor,
  type Action as ActionType,
  type FullActionsContext,
  ReadActionsContext,
} from './types';
import { assert } from './assert';
import { useCustomWindowEvents } from './use-window-events';
import { noopAdapter, type ActionTrackingAdapter } from './action-tracking';
import { Logger, useLogger } from './logger';

export type ActionsProviderProps = {
  children: ReactNode;
  actions?: ActionType<any>[];
  modelScope?: ModelScopeManager;
  trackingAdapter?: ActionTrackingAdapter;
  logger?: Logger;
};

const useReactiveActionsSetup = (
  actions: ActionType<any>[],
  context: FullActionsContext
) => {
  useKeyboardShortcuts(
    actions
      .filter((action) => {
        return action.shortcut !== undefined;
      })
      .map((action) => ({
        shortcut: action.shortcut!,
        // Consulted before the keystroke is consumed; see `shortcutAvailable`.
        available: () => action.shortcutAvailable?.() ?? true,
        callback: async () => {
          const newCtx = ActionsManager.fromExisting(context);
          newCtx.addModels(context.getAllInScopeModels());

          if (!action.applicable(newCtx)) {
            return;
          }

          const executableAction = newCtx.getAction(
            action.constructor as ActionConstructor<any>
          );
          assert(executableAction !== null);

          await executableAction.askOrExecute({}, newCtx);
        },
      }))
  );

  useCustomWindowEvents(
    actions
      .filter((action) => action.events !== undefined)
      .flatMap(
        (action) =>
          action.events?.map((event) => {
            return {
              event,
              callback: async (event: CustomEvent) => {
                const newCtx = ActionsManager.fromExisting(context);
                newCtx.addModels(context.getAllInScopeModels());

                if (!action.applicable(newCtx)) {
                  return;
                }

                await action.askOrExecute(event.detail, newCtx);
              },
            };
          }) ?? []
      )
  );
};

const ActionsContext = createContext<FullActionsContext | null>(null);

export function ActionsRegistryProvider({
  children,
  actions = [],
  modelScope,
  trackingAdapter,
  logger: loggerProp,
}: ActionsProviderProps) {
  // Get logger from context if available, otherwise use prop or default
  const loggerFromContext = useLogger();
  const logger = loggerProp ?? loggerFromContext;

  const contextValue = useMemo(
    () =>
      new ActionsManager(actions, {
        parentModelScope: modelScope,
        trackingAdapter: trackingAdapter ?? noopAdapter,
        logger,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [logger]
  );

  useReactiveActionsSetup(actions, contextValue);

  return (
    <ActionsContext.Provider value={contextValue}>
      {/*
        Actions and the model hooks have to see the same registry: an action
        asking what is in scope and a component asking for the same model are
        answered by one ModelScopeManager, owned here and published to both.
      */}
      <ModelScopeProvider scope={contextValue.getModelScope()}>
        {children}
      </ModelScopeProvider>
    </ActionsContext.Provider>
  );
}

export const Actions: React.FC<{
  actions: ActionType<any>[];
  children: ReactNode;
}> = ({ actions, children }) => {
  const context = useContext(ActionsContext);

  if (!context) {
    throw new Error('Actions must be used within an ActionsProvider');
  }

  useEffect(() => {
    actions.forEach((action) => {
      context!.registerAction(action);
    });

    return () => {
      actions.forEach((action) => {
        context!.unregisterAction(action);
      });
    };
  }, [actions, context]);

  useReactiveActionsSetup(actions, context);

  return <>{children}</>;
};

export const useActionsContext = (): ReadActionsContext => {
  const context = useContext(ActionsContext);
  if (!context) {
    throw new Error('useActionsContext must be used within an ActionsProvider');
  }
  return context;
};

/**
 * The actions context if there is one, `null` otherwise.
 *
 * For surfaces that may be rendered outside the provider — a modal mounted at
 * the document root, a portal owned by a dialog library — and are handed a
 * context explicitly instead. Everything inside the tree should use
 * {@link useActionsContext}, which fails loudly rather than silently doing
 * nothing.
 */
export const useOptionalActionsContext = (): ReadActionsContext | null => {
  return useContext(ActionsContext);
};
