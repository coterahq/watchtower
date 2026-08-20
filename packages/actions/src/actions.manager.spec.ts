import { describe, expect, it } from 'vitest';
import { ok } from 'neverthrow';
import { ActionsManager } from './actions.manager';
import { BaseAction } from './action.base';
import type { ActionResult, ApplicableContext, ExecuteContext } from './types';
import { z } from 'zod';

class NoopAction extends BaseAction<Record<string, never>> {
  title = 'Noop';
  inputSchema = z.object({});
  applicable(_context: ApplicableContext): boolean {
    return true;
  }
  async execute(
    _payload: Record<string, never>,
    _context: ExecuteContext
  ): Promise<ActionResult<{ t: string }[]>> {
    return ok({});
  }
}

describe('ActionsManager action registration refcount', () => {
  it('keeps an action registered until the last registrant unregisters', () => {
    const manager = new ActionsManager();

    // Two sibling artifacts each register their own instance of the same action
    // type into the shared scope (matches coco chat with two same-type editors).
    const first = new NoopAction();
    const second = new NoopAction();
    manager.registerAction(first);
    manager.registerAction(second);

    expect(manager.getAction(NoopAction)).not.toBeUndefined();

    // Closing one sibling must NOT drop the action for the one still open.
    manager.unregisterAction(first);
    expect(manager.getAction(NoopAction)).not.toBeUndefined();

    // Closing the last sibling drops it.
    manager.unregisterAction(second);
    expect(manager.getAction(NoopAction)).toBeUndefined();
  });

  it('re-registers cleanly after the refcount hits zero', () => {
    const manager = new ActionsManager();

    const a = new NoopAction();
    manager.registerAction(a);
    manager.unregisterAction(a);
    expect(manager.getAction(NoopAction)).toBeUndefined();

    const b = new NoopAction();
    manager.registerAction(b);
    expect(manager.getAction(NoopAction)).toBe(b);
    manager.unregisterAction(b);
    expect(manager.getAction(NoopAction)).toBeUndefined();
  });
});
