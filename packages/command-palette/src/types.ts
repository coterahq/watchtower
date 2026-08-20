import type { KeyboardEvent as ReactKeyboardEvent, HTMLAttributes } from 'react';
import type {
  Action,
  ApplicableContext,
  ReadActionsContext,
} from '@cotera/watchtower-actions';
import type { Model, ModelResource } from '@cotera/watchtower-models';

/** What every row in the palette has, whatever it turns out to be. */
export type CommandPaletteEntryBase = {
  /**
   * Position in `entries`. Rendering by section still needs it, because
   * selection and `getItemProps` are indexed against the flat list.
   */
  index: number;
  /** Unique within one result set; use it as the React key. */
  key: string;
  title: string;
  description?: string;
  group?: string;
  icon?: string;
};

export type CommandPaletteActionEntry = CommandPaletteEntryBase & {
  t: 'action';
  action: Action;
  shortcut?: string[];
};

export type CommandPaletteResourceEntry = CommandPaletteEntryBase & {
  t: 'resource';
  resource: ModelResource;
  /** The model that offered this resource. */
  model: Model;
};

export type CommandPaletteEntry =
  | CommandPaletteActionEntry
  | CommandPaletteResourceEntry;

/**
 * One rendered block of rows. `group` is the heading to draw; it is absent in
 * the flat layout, where the ranking is the order and headings would fight it.
 */
export type CommandPaletteSection = {
  kind: 'actions' | 'resources';
  group?: string;
  entries: CommandPaletteEntry[];
};

/**
 * `grouped` — headings, ordered by priority; what an unfiltered palette shows.
 * `flat` — one ranked list, once the query is specific enough that relevance
 * beats structure.
 */
export type CommandPaletteLayout = 'grouped' | 'flat';

export type CommandPaletteCloseReason =
  | 'action-executed'
  | 'resource-selected'
  | 'escape';

/** What the matcher gets to search over. */
export type CommandPaletteCandidate = {
  title: string;
  description?: string;
};

/**
 * Ranks candidates against a query and returns the indexes that matched, best
 * first. Indexes rather than items so the caller keeps its own objects, and so
 * a matcher cannot invent rows.
 */
export type CommandPaletteMatcher = (
  query: string,
  candidates: CommandPaletteCandidate[]
) => number[];

export type CommandPaletteOptions = {
  /**
   * The registry to read. Defaults to the surrounding `ActionsRegistryProvider`.
   * Pass it explicitly when the palette renders outside that tree — a modal
   * mounted at the document root — and capture it where the provider *is*.
   */
  context?: ReadActionsContext;

  /** Follows a `t: 'tab'` resource. Without it, tab resources do nothing. */
  onNavigate?: (route: string, resource: ModelResource) => void;

  /** Follows a `t: 'link'` resource. Defaults to `window.open(url, '_blank')`. */
  onOpenLink?: (url: string, resource: ModelResource) => void;

  /**
   * Called once the palette is done: an action ran to completion, a resource
   * was followed, or Escape was pressed. Close your dialog here.
   *
   * An action returning `ok({ next: true })` is *not* done — it has put its own
   * step on screen — so no close is reported for it.
   */
  onClose?: (reason: CommandPaletteCloseReason) => void;

  /** Called just before an entry is activated. The place for analytics. */
  onSelect?: (entry: CommandPaletteEntry) => void;

  /** Narrows the actions on offer, after the built-in visibility rules. */
  includeAction?: (action: Action, context: ApplicableContext) => boolean;

  /** Narrows the resources on offer. */
  includeResource?: (resource: ModelResource, model: Model) => boolean;

  /**
   * Query length at which the palette switches from grouped to flat.
   * Defaults to 3; `Infinity` keeps it grouped always.
   */
  flatSearchThreshold?: number;

  /** Ranking. Defaults to {@link defaultMatcher}; swap in Fuse.js if you like. */
  matcher?: CommandPaletteMatcher;

  /** Prefix for generated element ids. Defaults to `command-palette-item`. */
  idPrefix?: string;
};

export type CommandPaletteItemProps = HTMLAttributes<HTMLElement> & {
  id: string;
  'data-index': number;
  role: 'option';
  'aria-selected': boolean;
};

export type CommandPaletteListProps = {
  ref: (node: HTMLElement | null) => void;
  role: 'listbox';
  tabIndex: number;
  'aria-activedescendant': string | undefined;
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
};

export type CommandPalette = {
  search: string;
  setSearch: (search: string) => void;

  /** Every row, in render order. `entries[i].index === i`. */
  entries: CommandPaletteEntry[];
  /** The same rows, in the blocks they should be drawn in. */
  sections: CommandPaletteSection[];
  layout: CommandPaletteLayout;
  isEmpty: boolean;

  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  /** Moves the selection by `delta`, wrapping at both ends. */
  moveSelection: (delta: number) => void;

  /** Activates an entry — defaults to the selected one. */
  select: (index?: number) => Promise<void>;

  /** Arrow keys, Enter and Escape for the search input. */
  onInputKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;

  /** Spread onto the scrolling list container. */
  getListProps: () => CommandPaletteListProps;
  /** Spread onto each row. */
  getItemProps: (index: number, options?: { id?: string }) => CommandPaletteItemProps;

  activeDescendantId: string | undefined;
};
