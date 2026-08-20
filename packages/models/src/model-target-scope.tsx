import { createContext, useContext, type ReactNode } from 'react';

/**
 * Whether the surrounding subtree is the one the user is actually looking at.
 *
 * Models of the same type routinely coexist in one scope — a page and an
 * artifact open beside it, or several artifacts kept mounted so their editor
 * state survives tab switches. Only one of them can be "the" model of its type,
 * and mount order is the wrong way to pick: whichever mounted last would win
 * regardless of what is on screen, so an action fired from anywhere would reach
 * a hidden view.
 *
 * Wrapping a subtree in {@link ModelTargetScope} makes {@link ProvidedModel}
 * target only while that subtree is visible, and release targeting when it is
 * not. Outside any scope it defaults to true, so an ordinary page targets as it
 * always has.
 */
const ModelTargetScopeContext = createContext<boolean>(true);

export const ModelTargetScope: React.FC<{
  /** True when this subtree is the visible one. */
  active: boolean;
  children: ReactNode;
}> = ({ active, children }) => (
  <ModelTargetScopeContext.Provider value={active}>
    {children}
  </ModelTargetScopeContext.Provider>
);

/** True when the surrounding subtree is visible, or when there is no scope. */
export const useModelTargetingActive = (): boolean =>
  useContext(ModelTargetScopeContext);
