import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from './use-keyboard-shortcuts';

/** Cmd-<key> as the browser reports it on a Mac. */
function pressWithMeta(key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    metaKey: true,
    cancelable: true,
  });
  window.dispatchEvent(event);
  return event;
}

describe('useKeyboardShortcuts', () => {
  it('runs the callback for a matching chord', () => {
    const callback = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([{ shortcut: ['ctrl', 's'], callback }])
    );

    const event = pressWithMeta('s');

    expect(callback).toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves the event alone when the shortcut is unavailable', () => {
    const callback = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([
        { shortcut: ['ctrl', 'c'], available: () => false, callback },
      ])
    );

    const event = pressWithMeta('c');

    expect(callback).not.toHaveBeenCalled();
    // The point of `available`: an unavailable shortcut must not swallow a
    // keystroke the browser or a focused input still wants.
    expect(event.defaultPrevented).toBe(false);
  });

  it('matches the next chord while the modifier is still held', () => {
    const copy = vi.fn();
    const paste = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([
        { shortcut: ['ctrl', 'c'], callback: copy },
        { shortcut: ['ctrl', 'v'], callback: paste },
      ])
    );

    // No keyup in between: macOS does not deliver one for `c` while Command is
    // down, so the handler has to drop the stale key itself.
    pressWithMeta('c');
    pressWithMeta('v');

    expect(copy).toHaveBeenCalledTimes(1);
    expect(paste).toHaveBeenCalledTimes(1);
  });

  it('ignores a chord with an extra modifier', () => {
    const callback = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([{ shortcut: ['ctrl', 'c'], callback }])
    );

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'c', metaKey: true, shiftKey: true })
    );

    expect(callback).not.toHaveBeenCalled();
  });
});
