import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ok } from 'neverthrow';
import { z } from 'zod';
import type { ReactNode } from 'react';
import {
  BaseModel,
  ModelScopeFactory,
  type ModelResource,
} from '@cotera/watchtower-models';
import {
  ActionsRegistryProvider,
  BaseAction,
  useActionsContext,
  type Action,
  type ActionResult,
  type ApplicableContext,
  type ExecuteContext,
  type ReadActionsContext,
} from '@cotera/watchtower-actions';
import { useCommandPalette } from './use-command-palette';
import type { CommandPaletteOptions } from './types';

class Doc extends BaseModel {
  saved = false;

  resources(): ModelResource[] {
    return [
      {
        t: 'tab',
        name: 'Document settings',
        group: 'Document',
        priority: 5,
        tabRoute: '/docs/settings',
      },
      { t: 'link', name: 'Docs help', group: 'Help', url: 'https://help' },
    ];
  }
}

type NoPayload = Record<string, never>;

/** The plain case: applies when a Doc is in scope, runs with no input. */
class SaveDocAction extends BaseAction<NoPayload> {
  title = 'Save document';
  description = 'Write the document to the server';
  group = 'Document';
  priority = 10;
  inputSchema = z.object({});

  applicable(context: ApplicableContext): boolean {
    return context.isInScope(Doc);
  }

  async execute(
    _payload: NoPayload,
    context: ExecuteContext
  ): Promise<ActionResult<{ t: string }[]>> {
    const doc = context.getInScopeModelOfType(Doc);
    if (doc !== null) {
      doc.saved = true;
    }
    return ok({});
  }
}

class RenameDocAction extends BaseAction<NoPayload> {
  title = 'Rename document';
  group = 'Document';
  priority = 1;
  inputSchema = z.object({});

  applicable(): boolean {
    return true;
  }

  async execute(): Promise<ActionResult<{ t: string }[]>> {
    return ok({});
  }
}

class OpenSettingsAction extends BaseAction<NoPayload> {
  title = 'Open settings';
  group = 'App';
  priority = 2;
  inputSchema = z.object({});

  applicable(): boolean {
    return true;
  }

  async execute(): Promise<ActionResult<{ t: string }[]>> {
    return ok({});
  }
}

class HiddenAction extends BaseAction<NoPayload> {
  title = 'Internal thing';
  discrete = true;
  inputSchema = z.object({});

  applicable(): boolean {
    return true;
  }

  async execute(): Promise<ActionResult<{ t: string }[]>> {
    return ok({});
  }
}

class NeverApplicableAction extends BaseAction<NoPayload> {
  title = 'Not here';
  inputSchema = z.object({});

  applicable(): boolean {
    return false;
  }

  async execute(): Promise<ActionResult<{ t: string }[]>> {
    return ok({});
  }
}

/** Required input and no `ask` — nothing the palette can invoke it with. */
class NeedsInputAction extends BaseAction<{ name: string }> {
  title = 'Needs a name';
  inputSchema = z.object({ name: z.string() });

  applicable(): boolean {
    return true;
  }

  async execute(): Promise<ActionResult<{ t: string }[]>> {
    return ok({});
  }
}

/** Puts its own step on screen, so the palette must not close over it. */
class MultiStepAction extends BaseAction<NoPayload> {
  title = 'Multi step';
  inputSchema = z.object({});

  applicable(): boolean {
    return true;
  }

  async execute(): Promise<ActionResult<{ t: string }[]>> {
    return ok({ next: true });
  }
}

const DEFAULT_ACTIONS: Action<any>[] = [
  new SaveDocAction(),
  new RenameDocAction(),
  new OpenSettingsAction(),
  new HiddenAction(),
  new NeverApplicableAction(),
  new NeedsInputAction(),
];

function renderPalette(
  options: CommandPaletteOptions = {},
  {
    actions = DEFAULT_ACTIONS,
    docs = ['a'],
  }: { actions?: Action<any>[]; docs?: string[] } = {}
) {
  const created: Doc[] = [];
  const context: { current: ReadActionsContext | null } = { current: null };

  function CaptureContext() {
    context.current = useActionsContext();
    return null;
  }

  const wrapper = ({ children }: { children: ReactNode }) => (
    <ActionsRegistryProvider actions={actions}>
      <CaptureContext />
      <ModelScopeFactory
        createModels={() => {
          const models = docs.map((id) => new Doc(id));
          created.push(...models);
          return models;
        }}
        deps={[docs.join(',')]}
      >
        {children}
      </ModelScopeFactory>
    </ActionsRegistryProvider>
  );

  return {
    ...renderHook(() => useCommandPalette(options), { wrapper }),
    created,
    context,
  };
}

const titles = (entries: { title: string }[]) => entries.map((e) => e.title);

describe('useCommandPalette', () => {
  it('offers the actions that apply and hides the ones that cannot run', () => {
    const { result } = renderPalette();

    const actionTitles = titles(
      result.current.entries.filter((entry) => entry.t === 'action')
    );

    expect(actionTitles).toContain('Save document');
    expect(actionTitles).toContain('Open settings');
    // discrete, inapplicable, and "needs input it cannot ask for".
    expect(actionTitles).not.toContain('Internal thing');
    expect(actionTitles).not.toContain('Not here');
    expect(actionTitles).not.toContain('Needs a name');
  });

  it('lists the resources the models in scope offer, after the actions', () => {
    const { result } = renderPalette();

    const kinds = result.current.entries.map((entry) => entry.t);
    const firstResource = kinds.indexOf('resource');

    expect(firstResource).toBeGreaterThan(0);
    expect(kinds.slice(firstResource).every((kind) => kind === 'resource')).toBe(
      true
    );
    expect(titles(result.current.entries)).toContain('Document settings');
  });

  it('groups by priority when there is no query', () => {
    const { result } = renderPalette();

    expect(result.current.layout).toBe('grouped');

    const groups = result.current.sections
      .filter((section) => section.kind === 'actions')
      .map((section) => section.group);
    // Document totals 11, App totals 2.
    expect(groups).toEqual(['Document', 'App']);

    const document = result.current.sections.find(
      (section) => section.group === 'Document'
    );
    expect(titles(document!.entries)).toEqual([
      'Save document',
      'Rename document',
    ]);
  });

  it('indexes entries in render order, across sections', () => {
    const { result } = renderPalette();

    const flat = result.current.sections.flatMap((section) => section.entries);

    expect(flat).toEqual(result.current.entries);
    expect(flat.map((entry) => entry.index)).toEqual(
      flat.map((_entry, index) => index)
    );
  });

  it('goes flat once the query is specific enough, best match first', () => {
    const { result } = renderPalette();

    act(() => result.current.setSearch('re'));
    expect(result.current.layout).toBe('grouped');

    act(() => result.current.setSearch('ren'));
    expect(result.current.layout).toBe('flat');
    expect(result.current.entries[0]!.title).toBe('Rename document');
  });

  it('matches out-of-order characters and drops what does not match', () => {
    const { result } = renderPalette();

    act(() => result.current.setSearch('stng'));

    const found = titles(result.current.entries);
    expect(found).toContain('Open settings');
    expect(found).not.toContain('Save document');
  });

  it('takes a custom matcher', () => {
    const matcher = vi.fn(() => [0]);
    const { result } = renderPalette({ matcher });

    act(() => result.current.setSearch('anything'));

    expect(matcher).toHaveBeenCalled();
    expect(result.current.entries).toHaveLength(2); // one action, one resource
  });

  it('runs the selected action and reports the close', async () => {
    const onClose = vi.fn();
    const { result, created } = renderPalette({ onClose });

    const save = result.current.entries.find(
      (entry) => entry.title === 'Save document'
    )!;

    await act(async () => {
      await result.current.select(save.index);
    });

    expect(created[0]!.saved).toBe(true);
    expect(onClose).toHaveBeenCalledWith('action-executed');
  });

  it('stays open for an action that returns next', async () => {
    const onClose = vi.fn();
    const { result } = renderPalette(
      { onClose },
      { actions: [new MultiStepAction()] }
    );

    await act(async () => {
      await result.current.select(0);
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('navigates for a tab resource and opens a link for a link resource', async () => {
    const onNavigate = vi.fn();
    const onOpenLink = vi.fn();
    const onClose = vi.fn();
    const { result } = renderPalette({ onNavigate, onOpenLink, onClose });

    const tab = result.current.entries.find(
      (entry) => entry.title === 'Document settings'
    )!;
    const link = result.current.entries.find(
      (entry) => entry.title === 'Docs help'
    )!;

    await act(async () => {
      await result.current.select(tab.index);
    });
    await act(async () => {
      await result.current.select(link.index);
    });

    expect(onNavigate).toHaveBeenCalledWith('/docs/settings', expect.anything());
    expect(onOpenLink).toHaveBeenCalledWith('https://help', expect.anything());
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenLastCalledWith('resource-selected');
  });

  it('wraps the selection at both ends', () => {
    const { result } = renderPalette();
    const last = result.current.entries.length - 1;

    act(() => result.current.moveSelection(-1));
    expect(result.current.selectedIndex).toBe(last);

    act(() => result.current.moveSelection(1));
    expect(result.current.selectedIndex).toBe(0);
  });

  it('runs the selected entry on Enter and closes on Escape', async () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    const { result } = renderPalette({ onClose, onSelect });

    await act(async () => {
      result.current.onInputKeyDown(keyEvent('Enter'));
    });
    expect(onSelect).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.onInputKeyDown(keyEvent('Escape'));
    });
    expect(onClose).toHaveBeenLastCalledWith('escape');
  });

  it('puts the selection back at the top when the query changes', () => {
    const { result } = renderPalette();

    act(() => result.current.moveSelection(2));
    expect(result.current.selectedIndex).toBe(2);

    act(() => result.current.setSearch('doc'));
    expect(result.current.selectedIndex).toBe(0);
  });

  it('keeps the selection inside a list that shrank', () => {
    const { result } = renderPalette();

    act(() => result.current.moveSelection(-1));
    const last = result.current.selectedIndex;
    expect(last).toBeGreaterThan(0);

    act(() => result.current.setSearch('rename'));

    expect(result.current.selectedIndex).toBeLessThan(
      result.current.entries.length
    );
  });

  it('re-reads the scope when models come and go', () => {
    const { result, context } = renderPalette();

    const before = result.current.entries.length;

    // A second doc arriving brings its own resources with it, and the palette
    // is open the whole time — it has to notice.
    act(() => {
      context.current!.addModels([new Doc('b')]);
    });

    expect(result.current.entries.length).toBe(before + 2);
  });

  it('marks the selected row for assistive tech', () => {
    const { result } = renderPalette();

    const list = result.current.getListProps();
    expect(list.role).toBe('listbox');
    expect(list['aria-activedescendant']).toBe('command-palette-item-0');

    expect(result.current.getItemProps(0)['aria-selected']).toBe(true);
    expect(result.current.getItemProps(1)['aria-selected']).toBe(false);
  });

  it('reports empty when nothing matches', () => {
    const { result } = renderPalette();

    act(() => result.current.setSearch('zzzzzzz'));

    expect(result.current.isEmpty).toBe(true);
    expect(result.current.entries).toEqual([]);
    expect(result.current.activeDescendantId).toBeUndefined();
  });
});

function keyEvent(key: string) {
  return {
    key,
    preventDefault: vi.fn(),
  } as unknown as React.KeyboardEvent<HTMLElement>;
}
