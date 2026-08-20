import { describe, expect, it, vi } from 'vitest';
import { ModelScopeManager } from './model-scope.manager';
import { BaseModel } from './model.base';
import type { TargetableModel } from './types';

class Doc extends BaseModel {}

class Panel extends BaseModel implements TargetableModel {
  isTargeted = false;
  target = () => {
    this.isTargeted = true;
  };
  markAsNotTargeted = () => {
    this.isTargeted = false;
  };
}

describe('ModelScopeManager subscriptions', () => {
  it('announces additions and removals to subscribers', () => {
    const scope = ModelScopeManager.create();
    const seen = vi.fn();
    scope.subscribe(seen);

    const doc = new Doc('a');
    scope.addModel(doc);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen).toHaveBeenLastCalledWith([doc]);

    scope.removeModel(Doc, 'a');
    expect(seen).toHaveBeenCalledTimes(2);
    expect(seen).toHaveBeenLastCalledWith([]);
  });

  it('announces a batch of models once, not once per model', () => {
    const scope = ModelScopeManager.create();
    const seen = vi.fn();
    scope.subscribe(seen);

    scope.addModels([new Doc('a'), new Doc('b'), new Doc('c')]);

    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('stays quiet when a refcounted model is still held by someone else', () => {
    const scope = ModelScopeManager.create();
    const doc = new Doc('a');
    scope.addModel(doc);
    scope.addModel(doc); // a second subtree registers the same model

    const seen = vi.fn();
    scope.subscribe(seen);

    // The set of models has not changed, so there is nothing to announce.
    scope.removeModel(Doc, 'a');
    expect(seen).not.toHaveBeenCalled();

    scope.removeModel(Doc, 'a');
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('stops calling a subscriber once it unsubscribes', () => {
    const scope = ModelScopeManager.create();
    const seen = vi.fn();
    const off = scope.subscribe(seen);

    off();
    scope.addModel(new Doc('a'));

    expect(seen).not.toHaveBeenCalled();
  });

  describe('nested scopes', () => {
    it('tells a child scope about changes in its parent', () => {
      const parent = ModelScopeManager.create();
      const child = ModelScopeManager.create(parent);
      const seen = vi.fn();
      child.subscribe(seen);

      // A child can see the parent's models, so a change up there is a change here.
      const doc = new Doc('a');
      parent.addModel(doc);

      expect(seen).toHaveBeenCalledTimes(1);
      expect(child.getModelOfType(Doc)).toBe(doc);
    });

    it('does not tell a parent about changes in its child', () => {
      const parent = ModelScopeManager.create();
      const child = ModelScopeManager.create(parent);
      const seen = vi.fn();
      parent.subscribe(seen);

      child.addModel(new Doc('a'));

      expect(seen).not.toHaveBeenCalled();
      expect(parent.getModelOfType(Doc)).toBeNull();
    });

    it('releases the parent link on dispose', () => {
      const parent = ModelScopeManager.create();
      const child = ModelScopeManager.create(parent);
      const seen = vi.fn();
      child.subscribe(seen);

      child.dispose();
      parent.addModel(new Doc('a'));

      expect(seen).not.toHaveBeenCalled();
    });
  });
});

describe('ModelScopeManager targeting', () => {
  it('targets one model of a type at a time', () => {
    const scope = ModelScopeManager.create();
    const first = new Panel('first');
    const second = new Panel('second');
    scope.addModels([first, second]);

    scope.targetModel(first);
    expect(scope.targetedModelOfType(Panel)).toBe(first);

    scope.targetModel(second);
    expect(scope.targetedModelOfType(Panel)).toBe(second);
    expect(first.isTargeted).toBe(false);
  });

  it('ignores a model that is not in scope', () => {
    const scope = ModelScopeManager.create();
    const stray = new Panel('stray');

    scope.targetModel(stray);

    expect(stray.isTargeted).toBe(false);
    expect(scope.hasTargetedModelOfType(Panel)).toBe(false);
  });

  it('announces targeting changes', () => {
    const scope = ModelScopeManager.create();
    const panel = new Panel('p');
    scope.addModel(panel);
    const seen = vi.fn();
    scope.subscribe(seen);

    scope.targetModel(panel);
    expect(seen).toHaveBeenCalledTimes(1);

    scope.markAsNotTargeted(panel);
    expect(seen).toHaveBeenCalledTimes(2);
    expect(scope.targetedModelOfType(Panel)).toBeNull();
  });

  it('clears every target of a type', () => {
    const scope = ModelScopeManager.create();
    const first = new Panel('first');
    const second = new Panel('second');
    scope.addModels([first, second]);
    scope.targetModel(first);

    scope.removeTargetForType(Panel);

    expect(scope.hasTargetedModelOfType(Panel)).toBe(false);
    expect(first.isTargeted).toBe(false);
    expect(second.isTargeted).toBe(false);
  });

  it('announces to the scope that owns the model, not the one doing the targeting', () => {
    const parent = ModelScopeManager.create();
    const child = ModelScopeManager.create(parent);
    const panel = new Panel('p');
    parent.addModel(panel);

    const parentSaw = vi.fn();
    parent.subscribe(parentSaw);

    // Targeting mutates the model itself, which lives in the parent — so the
    // parent's other subscribers have to hear about it.
    child.targetModel(panel);

    expect(parentSaw).toHaveBeenCalledTimes(1);
    expect(parent.targetedModelOfType(Panel)).toBe(panel);
  });
});
