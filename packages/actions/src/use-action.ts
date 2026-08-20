import { useCallback } from 'react';
import { useActionsContext } from './context';
import { ActionConstructor, ActionPayload } from './types';

export function useAction<P extends ActionPayload>(
  actionConstructor: ActionConstructor<P>
) {
  const context = useActionsContext();
  const { getAction } = context;

  const execute = useCallback(
    async (payload: Partial<P> = {}) => {
      const action = getAction<P>(actionConstructor);

      if (action === undefined) {
        const key = actionConstructor.actionId ?? actionConstructor.name;
        throw new Error(
          `Action "${key}" not found. Make sure it is registered in an Actions provider.`
        );
      }

      const result = await action.askOrExecute(payload, context);

      return result;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actionConstructor, context]
  );

  return {
    execute,
    action: {
      get shortcut() {
        return getAction(actionConstructor)?.shortcut;
      },
      get title() {
        return getAction(actionConstructor)?.title ?? '';
      },
      get icon() {
        return getAction(actionConstructor)?.icon ?? '';
      },
    },
  };
}
