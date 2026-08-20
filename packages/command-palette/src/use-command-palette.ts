import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  ActionsManager,
  useOptionalActionsContext,
  type Action,
  type ActionConstructor,
  type ApplicableContext,
  type ReadActionsContext,
} from '@cotera/watchtower-actions';
import type { Model, ModelResource } from '@cotera/watchtower-models';
import { defaultMatcher } from './match';
import type {
  CommandPalette,
  CommandPaletteEntry,
  CommandPaletteItemProps,
  CommandPaletteLayout,
  CommandPaletteListProps,
  CommandPaletteOptions,
  CommandPaletteSection,
} from './types';

const DEFAULT_FLAT_SEARCH_THRESHOLD = 3;
const DEFAULT_ID_PREFIX = 'command-palette-item';
const SCROLL_PADDING = 8;

/**
 * An entry before it knows where in the list it landed. Distributed over the
 * union by hand: a bare `Omit` of a union keeps only the keys both members
 * share, which would drop `action` and `resource` along with the discriminant.
 */
type UnplacedEntry = CommandPaletteEntry extends infer Entry
  ? Entry extends CommandPaletteEntry
    ? Omit<Entry, 'index'>
    : never
  : never;

type ScopedResource = { model: Model; resource: ModelResource };

/**
 * A command palette over everything the app already declared: the actions in
 * scope, and the resources the viewmodels in scope offer.
 *
 * It owns the search text, the ranking, the grouping and the selection, and
 * hands back rows plus the props to render them with. Nothing here draws
 * anything — the palette's *look* is yours, its behaviour is not worth writing
 * twice.
 *
 * ```tsx
 * const palette = useCommandPalette({
 *   onNavigate: (route) => router.push(route),
 *   onClose: () => setOpen(false),
 * });
 * ```
 */
export function useCommandPalette(
  options: CommandPaletteOptions = {}
): CommandPalette {
  const {
    context: explicitContext,
    onNavigate,
    onOpenLink,
    onClose,
    onSelect,
    includeAction,
    includeResource,
    flatSearchThreshold = DEFAULT_FLAT_SEARCH_THRESHOLD,
    matcher = defaultMatcher,
    idPrefix = DEFAULT_ID_PREFIX,
  } = options;

  const contextFromProvider = useOptionalActionsContext();
  const context = explicitContext ?? contextFromProvider;

  if (context === null) {
    throw new Error(
      'useCommandPalette must be used within an ActionsRegistryProvider, or given a `context` explicitly.'
    );
  }

  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndexState] = useState(0);
  const listElement = useRef<HTMLElement | null>(null);

  // Models come and go while the palette is open — a tab loads, a panel
  // mounts — and both what applies and what is navigable move with them.
  const scopeVersion = useScopeVersion(context);

  // Applicability is asked of a throwaway manager holding the same actions and
  // a copy of the current models, which is what the shortcut and event paths
  // do too: an action sees the scope as it is now, not as it was at render.
  const applicableContext = useMemo(
    // eslint-disable-next-line react-hooks/exhaustive-deps
    () => ActionsManager.fromExisting(context) as ApplicableContext,
    [context, scopeVersion]
  );

  const actions = useMemo(() => {
    // Reversed so the most recently registered action — the one belonging to
    // whatever just came on screen — leads its group.
    const registered = [...context.getAllActions()].reverse();

    return registered.filter(
      (action) =>
        isOfferedInPalette(action) &&
        action.applicable(applicableContext) &&
        // An action that needs input it cannot ask for has nothing to run with.
        (!action.requiresInputArgs() || action.ask !== undefined) &&
        (includeAction?.(action, applicableContext) ?? true)
    );
  }, [context, applicableContext, includeAction]);

  const resources = useMemo(() => {
    const offered: ScopedResource[] = context
      .getAllInScopeModels()
      .flatMap((model) =>
        (model.resources?.() ?? []).map((resource) => ({ model, resource }))
      );

    return offered.filter(
      ({ model, resource }) => includeResource?.(resource, model) ?? true
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, scopeVersion, includeResource]);

  const query = search.trim();

  const rankedActions = useMemo(
    () =>
      query.length === 0
        ? actions
        : pick(
            actions,
            matcher(
              query,
              actions.map((action) => ({
                title: action.title,
                description: action.description,
              }))
            )
          ),
    [actions, matcher, query]
  );

  const rankedResources = useMemo(
    () =>
      query.length === 0
        ? resources
        : pick(
            resources,
            matcher(
              query,
              resources.map(({ resource }) => ({
                title: resource.name,
                description: resource.description,
              }))
            )
          ),
    [resources, matcher, query]
  );

  const layout: CommandPaletteLayout =
    query.length >= flatSearchThreshold ? 'flat' : 'grouped';

  const { entries, sections } = useMemo(() => {
    const actionEntries = rankedActions.map(toActionEntry);
    const resourceEntries = rankedResources.map(toResourceEntry);

    if (layout === 'flat') {
      return place([
        { kind: 'actions' as const, entries: actionEntries },
        { kind: 'resources' as const, entries: resourceEntries },
      ]);
    }

    // Priority only orders an unfiltered list. Once there is a query, the
    // ranking is the order, and re-sorting by priority would throw it away.
    const sortWithinGroup = query.length === 0;

    const priorityOf = (entry: UnplacedEntry): number =>
      entry.t === 'action'
        ? actionPriority(entry.action, applicableContext)
        : entry.resource.priority ?? 0;

    return place([
      ...group(actionEntries, 'actions', sortWithinGroup, priorityOf),
      ...group(resourceEntries, 'resources', sortWithinGroup, priorityOf),
    ]);
  }, [rankedActions, rankedResources, layout, query.length, applicableContext]);

  const setSelectedIndex = useCallback((index: number) => {
    setSelectedIndexState(index);
  }, []);

  const moveSelection = useCallback(
    (delta: number) => {
      if (entries.length === 0) {
        return;
      }
      setSelectedIndexState(
        (previous) =>
          (((previous + delta) % entries.length) + entries.length) %
          entries.length
      );
    },
    [entries.length]
  );

  // A new query means a new best answer, and it is at the top.
  useEffect(() => {
    setSelectedIndexState(0);
  }, [query]);

  // The list shrank under the cursor.
  useEffect(() => {
    setSelectedIndexState((previous) => {
      if (entries.length === 0) {
        return 0;
      }
      return Math.min(Math.max(previous, 0), entries.length - 1);
    });
  }, [entries.length]);

  useEffect(() => {
    scrollIntoView(listElement.current, selectedIndex);
  }, [selectedIndex, entries.length]);

  const select = useCallback(
    async (index?: number) => {
      const entry = entries[index ?? selectedIndex];
      if (entry === undefined) {
        return;
      }

      onSelect?.(entry);

      if (entry.t === 'action') {
        const result = await entry.action.askOrExecute({}, context);

        // `next: true` is an action saying it put its own step on screen. The
        // palette stays out of the way rather than closing over the top of it.
        if (result.isOk() && result.value.next === true) {
          return;
        }

        onClose?.('action-executed');
        return;
      }

      const { resource } = entry;
      switch (resource.t) {
        case 'tab':
          onNavigate?.(resource.tabRoute, resource);
          break;
        case 'link':
          if (onOpenLink !== undefined) {
            onOpenLink(resource.url, resource);
          } else {
            window.open(resource.url, '_blank');
          }
          break;
      }

      onClose?.('resource-selected');
    },
    [entries, selectedIndex, onSelect, context, onClose, onNavigate, onOpenLink]
  );

  const onInputKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      switch (event.key) {
        case 'ArrowDown':
          if (entries.length === 0) {
            return;
          }
          event.preventDefault();
          moveSelection(1);
          break;
        case 'ArrowUp':
          if (entries.length === 0) {
            return;
          }
          event.preventDefault();
          moveSelection(-1);
          break;
        case 'Enter':
          if (entries.length === 0) {
            return;
          }
          event.preventDefault();
          void select();
          break;
        case 'Escape':
          event.preventDefault();
          onClose?.('escape');
          break;
        // Space is deliberately absent: in the input it is a character.
      }
    },
    [entries.length, moveSelection, onClose, select]
  );

  const onListKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.key === ' ' && entries.length > 0) {
        // Focus is in the list rather than the input, so space picks.
        event.preventDefault();
        void select();
        return;
      }
      onInputKeyDown(event);
    },
    [entries.length, onInputKeyDown, select]
  );

  const itemId = useCallback(
    (index: number) => `${idPrefix}-${index}`,
    [idPrefix]
  );

  const activeDescendantId =
    entries.length === 0 ? undefined : itemId(selectedIndex);

  const setListElement = useCallback((node: HTMLElement | null) => {
    listElement.current = node;
  }, []);

  const getListProps = useCallback(
    (): CommandPaletteListProps => ({
      ref: setListElement,
      role: 'listbox',
      tabIndex: 0,
      'aria-activedescendant': activeDescendantId,
      onKeyDown: onListKeyDown,
    }),
    [setListElement, activeDescendantId, onListKeyDown]
  );

  const getItemProps = useCallback(
    (index: number, itemOptions?: { id?: string }): CommandPaletteItemProps => ({
      id: itemOptions?.id ?? itemId(index),
      'data-index': index,
      role: 'option',
      'aria-selected': index === selectedIndex,
      onMouseEnter: () => setSelectedIndexState(index),
      onClick: () => {
        setSelectedIndexState(index);
        void select(index);
      },
    }),
    [itemId, selectedIndex, select]
  );

  return {
    search,
    setSearch,
    entries,
    sections,
    layout,
    isEmpty: entries.length === 0,
    selectedIndex,
    setSelectedIndex,
    moveSelection,
    select,
    onInputKeyDown,
    getListProps,
    getItemProps,
    activeDescendantId,
  };
}

/**
 * Re-reads the scope whenever it changes. A counter rather than the model array
 * itself: `getAllInScopeModels()` builds a new array every call, so anything
 * comparing snapshots would never settle.
 */
function useScopeVersion(context: ReadActionsContext): number {
  const [version, setVersion] = useState(0);

  useEffect(
    () => context.subscribe(() => setVersion((previous) => previous + 1)),
    [context]
  );

  return version;
}

/** Hidden from the palette, whichever way the action said so. */
function isOfferedInPalette(action: Action): boolean {
  return (
    action.discrete !== true && action.scopes?.includes('discrete') !== true
  );
}

function actionPriority(action: Action, context: ApplicableContext): number {
  return typeof action.getPriority === 'function'
    ? action.getPriority(context)
    : action.priority ?? 0;
}

/** Matches how the registry keys actions, so a minified build still works. */
function actionKey(action: Action): string {
  const constructor = action.constructor as ActionConstructor<any>;
  return constructor.actionId ?? constructor.name;
}

function toActionEntry(action: Action): UnplacedEntry {
  return {
    t: 'action',
    key: `action:${actionKey(action)}`,
    action,
    title: action.title,
    description: action.description,
    group: action.group,
    icon: action.icon,
    shortcut: action.shortcut,
  };
}

function toResourceEntry({ model, resource }: ScopedResource): UnplacedEntry {
  return {
    t: 'resource',
    key: `resource:${model.id}:${resource.name}`,
    resource,
    model,
    title: resource.name,
    description: resource.description,
    group: resource.group,
    icon: resource.icon,
  };
}

function pick<T>(items: T[], indexes: number[]): T[] {
  const picked: T[] = [];
  for (const index of indexes) {
    const item = items[index];
    if (item !== undefined) {
      picked.push(item);
    }
  }
  return picked;
}

/**
 * Buckets entries by their `group`, ordering the buckets by the priority they
 * add up to — so the group holding the most relevant things leads.
 */
function group(
  entries: UnplacedEntry[],
  kind: CommandPaletteSection['kind'],
  sortWithinGroup: boolean,
  priorityOf: (entry: UnplacedEntry) => number
): { kind: CommandPaletteSection['kind']; group: string; entries: UnplacedEntry[] }[] {
  const buckets = new Map<string, UnplacedEntry[]>();

  for (const entry of entries) {
    const name = entry.group ?? 'Other';
    const bucket = buckets.get(name);
    if (bucket === undefined) {
      buckets.set(name, [entry]);
    } else {
      bucket.push(entry);
    }
  }

  return [...buckets.entries()]
    .map(([name, items]) => ({
      kind,
      group: name,
      entries: sortWithinGroup
        ? [...items].sort((a, b) => priorityOf(b) - priorityOf(a))
        : items,
      priority: items.reduce((total, item) => total + priorityOf(item), 0),
    }))
    .sort((a, b) => b.priority - a.priority)
    .map(({ kind: sectionKind, group: name, entries: items }) => ({
      kind: sectionKind,
      group: name,
      entries: items,
    }));
}

/**
 * Walks the sections in render order and stamps each entry with its position,
 * so a grouped render can index into the flat list without searching it.
 */
function place(
  sections: {
    kind: CommandPaletteSection['kind'];
    group?: string;
    entries: UnplacedEntry[];
  }[]
): { entries: CommandPaletteEntry[]; sections: CommandPaletteSection[] } {
  const entries: CommandPaletteEntry[] = [];
  const placed: CommandPaletteSection[] = [];

  for (const section of sections) {
    if (section.entries.length === 0) {
      continue;
    }

    const sectionEntries = section.entries.map((entry) => {
      const withIndex: CommandPaletteEntry =
        entry.t === 'action'
          ? { ...entry, index: entries.length }
          : { ...entry, index: entries.length };
      entries.push(withIndex);
      return withIndex;
    });

    placed.push({
      kind: section.kind,
      group: section.group,
      entries: sectionEntries,
    });
  }

  return { entries, sections: placed };
}

/** Keeps the selected row inside the scroll container, without jumping. */
function scrollIntoView(list: HTMLElement | null, index: number): void {
  if (list === null) {
    return;
  }

  const selected = list.querySelector<HTMLElement>(`[data-index="${index}"]`);
  if (selected === null) {
    return;
  }

  const listBounds = list.getBoundingClientRect();
  const selectedBounds = selected.getBoundingClientRect();

  if (selectedBounds.top < listBounds.top) {
    list.scrollTop -= listBounds.top - selectedBounds.top + SCROLL_PADDING;
  } else if (selectedBounds.bottom > listBounds.bottom) {
    list.scrollTop += selectedBounds.bottom - listBounds.bottom + SCROLL_PADDING;
  }
}
