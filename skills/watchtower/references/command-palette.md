# `@cotera/watchtower-command-palette` — the headless palette

Ctrl-K over two lists the app has already declared: the actions currently
applicable, and the resources the models in scope expose. Nothing new to
register — a feature that ships an action and a model is already in the palette.

Peers: `react`, `zod`, `neverthrow`. Depends on `@cotera/watchtower-actions`, so
it belongs inside an `ActionsRegistryProvider`.

It renders nothing. `useCommandPalette` returns rows plus the props to draw them
with; the markup and the styling are the app's.

## The hook

```tsx
const palette = useCommandPalette({
  onNavigate: (route) => router.push(route),   // t: 'tab' resources
  onClose: () => setOpen(false),
});
```

```ts
type CommandPalette = {
  search: string;
  setSearch(value: string): void;
  entries: CommandPaletteEntry[];      // flat, render order, entries[i].index === i
  sections: CommandPaletteSection[];   // the same rows in the blocks to draw
  layout: 'grouped' | 'flat';
  isEmpty: boolean;
  selectedIndex: number;
  setSelectedIndex(index: number): void;
  moveSelection(delta: number): void;  // wraps at both ends
  select(index?: number): Promise<void>;
  onInputKeyDown(event): void;         // arrows, Enter, Escape — not space
  getListProps(): { ref, role, tabIndex, 'aria-activedescendant', onKeyDown };
  getItemProps(index, opts?): { id, 'data-index', role, 'aria-selected', … };
  activeDescendantId: string | undefined;
};
```

Every entry — action or resource — carries `title`, `description?`, `group?`,
`icon?` and a `key`, so one row component renders both. `t` discriminates when
you need the underlying `action` or `resource`.

Render `sections` (skipping the heading when `section.group` is undefined, which
is the flat layout) or render `entries` directly. Either way `entry.index` is
what selection and `getItemProps` are keyed on — never the position within a
section.

`getListProps()` carries the ref the palette scrolls, so spread it onto the
element that actually scrolls.

## What lands in the list

Actions, in registration order **reversed** — the most recently registered leads,
because it belongs to whatever just came on screen — minus any that are
`discrete` (or scope-`'discrete'`), answer false to `applicable(context)`, or
require input while defining no `ask`.

Resources, from `model.resources?.()` for every model in scope:

```ts
resources(): ModelResource[] {
  return this.recentChats.snapshot().map((chat) => ({
    t: 'tab',
    name: chat.title,
    group: 'Chat',
    priority: 5,
    tabRoute: `/chats/${chat.id}`,
  }));
}
```

This is how a global search gets its content: one app-shell model returning the
recent chats, agents, documents and folders it already holds. `t: 'link'`
resources open externally instead.

Scope here means the registry `ActionsRegistryProvider` owns — the one
`ModelScopeFactory` registers into. A model put in a separate
`ModelScopeProvider` is invisible to actions and to the palette alike; that is
the same rule as everywhere else, not a palette quirk.

Both lists are re-read when the model scope changes — the hook subscribes — so a
palette left open while a tab finishes loading does not go stale. Applicability
is evaluated against a throwaway registry holding the current models, the same
as the shortcut and window-event paths, so an action sees the scope as it is now
rather than as it was at mount.

## Ordering

| Query | Layout | Order |
| --- | --- | --- |
| empty | grouped | priority within a group, groups by summed priority |
| 1–2 chars | grouped | match rank within a group, groups by summed priority |
| 3+ chars | flat | match rank, actions then resources |

An action's priority is `getPriority?.(context) ?? priority ?? 0`, so it can
depend on what is on screen — "20 when a dataset is targeted, 0 otherwise" is
the usual shape. A resource's is `priority ?? 0`. Once there is a query, ranking
is the order and priority steps out of the way.

`flatSearchThreshold` moves the 3; `Infinity` keeps it grouped forever.

The default matcher is a dependency-free fuzzy scorer — characters in order,
with adjacency, word starts and whole-substring hits worth more, descriptions at
half weight. `matcher` swaps it for anything that ranks by index:

```ts
matcher: (query, candidates) =>
  new Fuse(candidates, { keys: ['title', 'description'] })
    .search(query)
    .map((hit) => hit.refIndex),
```

## Selecting

`select(index?)` runs an action through `askOrExecute` — so an action with an
`ask` dialog opens it from the palette exactly as from a button — or follows a
resource via `onNavigate` / `onOpenLink` (`window.open(url, '_blank')` by
default).

`onClose(reason)` reports `'action-executed'`, `'resource-selected'` or
`'escape'`; that is the cue to close the dialog. **An action returning
`ok({ next: true })` reports nothing**: it has put its own step on screen, and
closing over it is the bug that flag exists to prevent.

`onSelect(entry)` fires just before activation — the place for analytics, beside
`onClose` for the trigger.

## Opening it

```tsx
useCommandPaletteTrigger({
  enabled: !isOpen,
  onOpen: (trigger) => {                       // 'keyboard' | 'event'
    analytics.track('Command Palette Opened', { trigger });
    setOpen(true);
  },
});
```

Ctrl-K (Meta normalises to `ctrl`) plus `open-command-palette` as a window
`CustomEvent`, for code with no view in reach. `shortcut: null` or `event: null`
drops either. **`enabled: false` is not the same as ignoring the key** — it is
checked before the keystroke is consumed, so a disabled trigger leaves Ctrl-K to
whatever else wants it.

## Rendering outside the provider

A modal library that mounts at the document root can put the palette outside the
`ActionsRegistryProvider`. Capture the context where the provider is, and pass it:

```tsx
const context = useActionsContext();                    // inside the provider
modals.open(() => <PaletteView context={context} />);

// …and in the view
const palette = useCommandPalette({ context });
```

`useOptionalActionsContext()` (from `-actions`) is the same escape hatch for any
other surface that may or may not be inside the tree.
