import { render, screen, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ok } from 'neverthrow';
import { z } from 'zod';
import { BaseModel, ModelScopeFactory } from '@cotera/watchtower-models';
import { ActionsRegistryProvider, useActionsContext } from './context';
import { BaseAction } from './action.base';
import { useAction } from './use-action';
import type { ActionResult, ApplicableContext, ExecuteContext } from './types';

class Doc extends BaseModel {
  saved = false;
}

class SaveDocAction extends BaseAction<Record<string, never>> {
  title = 'Save doc';
  inputSchema = z.object({});

  applicable(context: ApplicableContext): boolean {
    return context.isInScope(Doc);
  }

  async execute(
    _payload: Record<string, never>,
    context: ExecuteContext
  ): Promise<ActionResult<{ t: string }[]>> {
    const doc = context.getInScopeModelOfType(Doc);
    if (doc !== null) {
      doc.saved = true;
    }
    return ok({});
  }
}

/**
 * The action registry and the model hooks are separate packages now, so the one
 * thing worth proving is that they still see the same registry: a model put in
 * scope by the model layer has to be visible to an action reading its context.
 */
describe('actions over a model scope', () => {
  it('lets an action reach a model registered through ModelScopeFactory', async () => {
    const created: Doc[] = [];

    render(
      <ActionsRegistryProvider actions={[new SaveDocAction()]}>
        <ModelScopeFactory
          createModels={() => {
            const doc = new Doc('a');
            created.push(doc);
            return [doc];
          }}
          deps={[]}
        >
          <SaveButton />
        </ModelScopeFactory>
      </ActionsRegistryProvider>
    );

    await act(async () => {
      screen.getByText('Save doc').click();
    });

    expect(created).toHaveLength(1);
    expect(created[0]!.saved).toBe(true);
  });

  it('reports an action as inapplicable when its model is not in scope', () => {
    let applicable: boolean | null = null;

    function Probe() {
      const context = useActionsContext();
      applicable = context
        .getAllActions()
        .every((action) => action.applicable(context));
      return null;
    }

    render(
      <ActionsRegistryProvider actions={[new SaveDocAction()]}>
        <Probe />
      </ActionsRegistryProvider>
    );

    expect(applicable).toBe(false);
  });
});

function SaveButton() {
  const { execute, action } = useAction(SaveDocAction);
  return <button onClick={() => void execute()}>{action.title}</button>;
}
