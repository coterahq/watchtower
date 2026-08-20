import { render, screen, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { ModelScopeProvider, useModelScope } from './model-scope.context';
import { ModelScopeFactory } from './model-scope';
import { BaseModel } from './model.base';
import {
  useInScopeModel,
  useStatefullyAwareInScopeModel,
} from './use-in-scope-model';

class Doc extends BaseModel {
  constructor(id: string, public title: string) {
    super(id);
  }
}

/**
 * The viewmodel layer has to stand up without the action layer — nothing in
 * these tests imports `@cotera/watchtower-actions`.
 */
describe('models without actions', () => {
  it('finds a registered model by type', () => {
    render(
      <ModelScopeProvider>
        <ModelScopeFactory createModels={() => [new Doc('a', 'Hello')]} deps={[]}>
          <Title />
        </ModelScopeFactory>
      </ModelScopeProvider>
    );

    expect(screen.getByText('Hello')).toBeDefined();
  });

  it('re-renders a stateful reader when a model arrives', () => {
    function Harness() {
      const [mounted, setMounted] = useState(false);
      return (
        <ModelScopeProvider>
          <MaybeTitle />
          {mounted && (
            <ModelScopeFactory
              createModels={() => [new Doc('a', 'Arrived')]}
              deps={[]}
            />
          )}
          <button onClick={() => setMounted(true)}>mount</button>
        </ModelScopeProvider>
      );
    }

    render(<Harness />);
    expect(screen.getByText('no doc')).toBeDefined();

    act(() => {
      screen.getByText('mount').click();
    });

    expect(screen.getByText('Arrived')).toBeDefined();
  });

  it('unregisters the model when the scope unmounts', () => {
    let scope: ReturnType<typeof useModelScope> | null = null;
    function Capture() {
      scope = useModelScope();
      return null;
    }

    function Harness({ show }: { show: boolean }) {
      return (
        <ModelScopeProvider>
          <Capture />
          {show && (
            <ModelScopeFactory
              createModels={() => [new Doc('a', 'Hello')]}
              deps={[]}
            />
          )}
        </ModelScopeProvider>
      );
    }

    const { rerender } = render(<Harness show={true} />);
    expect(scope!.getModelOfType(Doc)).not.toBeNull();

    rerender(<Harness show={false} />);
    expect(scope!.getModelOfType(Doc)).toBeNull();
  });

  it('resolves from an enclosing scope when the nearest one has no match', () => {
    render(
      <ModelScopeProvider>
        <ModelScopeFactory
          createModels={() => [new Doc('outer', 'From outer')]}
          deps={[]}
        >
          <ModelScopeProvider>
            <Title />
          </ModelScopeProvider>
        </ModelScopeFactory>
      </ModelScopeProvider>
    );

    expect(screen.getByText('From outer')).toBeDefined();
  });
});

/**
 * These pin down why `ModelScopeFactory` is the only scope component. The
 * removed `<ModelScope models={[...]}>` took a fresh array literal on every
 * render, so it disposed and re-registered its models on every parent render,
 * and — holding instances built outside the effect — re-registered already
 * disposed ones after a remount.
 */
describe('registration lifecycle', () => {
  class Tracked extends BaseModel {
    static log: string[] = [];
    onCreate() {
      Tracked.log.push(`create:${this.id}`);
    }
    dispose() {
      Tracked.log.push(`dispose:${this.id}`);
    }
  }

  it('does not re-register when the parent re-renders', () => {
    Tracked.log = [];
    let rerenderParent: () => void = () => {};

    function Harness() {
      const [, setTick] = useState(0);
      rerenderParent = () => setTick((n) => n + 1);
      return (
        <ModelScopeFactory createModels={() => [new Tracked('a')]} deps={[]}>
          <div />
        </ModelScopeFactory>
      );
    }

    render(
      <ModelScopeProvider>
        <Harness />
      </ModelScopeProvider>
    );
    expect(Tracked.log).toEqual(['create:a']);

    act(() => rerenderParent());
    act(() => rerenderParent());

    expect(Tracked.log).toEqual(['create:a']);
  });

  it('builds a fresh model on remount rather than reviving a disposed one', () => {
    Tracked.log = [];
    const seen: Tracked[] = [];

    function Harness({ show }: { show: boolean }) {
      return (
        <ModelScopeProvider>
          {show && (
            <ModelScopeFactory
              createModels={() => {
                const model = new Tracked('z');
                seen.push(model);
                return [model];
              }}
              deps={[]}
            />
          )}
        </ModelScopeProvider>
      );
    }

    const { rerender } = render(<Harness show={true} />);
    rerender(<Harness show={false} />);
    rerender(<Harness show={true} />);

    expect(Tracked.log).toEqual(['create:z', 'dispose:z', 'create:z']);
    // The revived registration is a *new* instance, not the disposed one.
    expect(seen).toHaveLength(2);
    expect(seen[0]).not.toBe(seen[1]);
  });

  it('re-registers when deps change', () => {
    Tracked.log = [];

    function Harness({ id }: { id: string }) {
      return (
        <ModelScopeProvider>
          <ModelScopeFactory
            createModels={() => [new Tracked(id)]}
            deps={[id]}
          />
        </ModelScopeProvider>
      );
    }

    const { rerender } = render(<Harness id="a" />);
    rerender(<Harness id="b" />);

    expect(Tracked.log).toEqual(['create:a', 'dispose:a', 'create:b']);
  });
});

function Title() {
  const doc = useInScopeModel(Doc);
  return <span>{doc.title}</span>;
}

function MaybeTitle() {
  const doc = useStatefullyAwareInScopeModel(Doc);
  return <span>{doc?.title ?? 'no doc'}</span>;
}
