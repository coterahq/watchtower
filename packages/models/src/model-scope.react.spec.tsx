import { render, screen, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { ModelScopeProvider, useModelScope } from './model-scope.context';
import { ModelScope } from './model-scope';
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
    const doc = new Doc('a', 'Hello');

    render(
      <ModelScopeProvider>
        <ModelScope models={[doc]}>
          <Title />
        </ModelScope>
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
          {mounted && <ModelScope models={[new Doc('a', 'Arrived')]} />}
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
          {show && <ModelScope models={[new Doc('a', 'Hello')]} />}
        </ModelScopeProvider>
      );
    }

    const { rerender } = render(<Harness show={true} />);
    expect(scope!.getModelOfType(Doc)).not.toBeNull();

    rerender(<Harness show={false} />);
    expect(scope!.getModelOfType(Doc)).toBeNull();
  });

  it('resolves from an enclosing scope when the nearest one has no match', () => {
    const outer = new Doc('outer', 'From outer');

    render(
      <ModelScopeProvider>
        <ModelScope models={[outer]}>
          <ModelScopeProvider>
            <Title />
          </ModelScopeProvider>
        </ModelScope>
      </ModelScopeProvider>
    );

    expect(screen.getByText('From outer')).toBeDefined();
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
