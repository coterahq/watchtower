import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCommandPaletteTrigger } from './use-command-palette-trigger';

/** Cmd-<key>, as a Mac reports it. `ctrl` covers Control and Meta both. */
function press(key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    metaKey: true,
    cancelable: true,
  });
  window.dispatchEvent(event);
  return event;
}

describe('useCommandPaletteTrigger', () => {
  it('opens on Ctrl-K', () => {
    const onOpen = vi.fn();
    renderHook(() => useCommandPaletteTrigger({ onOpen }));

    press('k');

    expect(onOpen).toHaveBeenCalledWith('keyboard', expect.anything());
  });

  it('opens on the window event', () => {
    const onOpen = vi.fn();
    renderHook(() => useCommandPaletteTrigger({ onOpen }));

    window.dispatchEvent(new CustomEvent('open-command-palette'));

    expect(onOpen).toHaveBeenCalledWith('event', expect.anything());
  });

  it('leaves the chord alone when disabled', () => {
    const onOpen = vi.fn();
    renderHook(() => useCommandPaletteTrigger({ onOpen, enabled: false }));

    const event = press('k');

    expect(onOpen).not.toHaveBeenCalled();
    // Not merely ignored — the keystroke has to reach whatever else wants it,
    // which is why `available` runs before `preventDefault`.
    expect(event.defaultPrevented).toBe(false);
  });

  it('takes a different chord and event name', () => {
    const onOpen = vi.fn();
    renderHook(() =>
      useCommandPaletteTrigger({
        onOpen,
        shortcut: ['ctrl', 'p'],
        event: 'show-palette',
      })
    );

    press('k');
    expect(onOpen).not.toHaveBeenCalled();

    press('p');
    window.dispatchEvent(new CustomEvent('show-palette'));

    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('binds nothing when both are null', () => {
    const onOpen = vi.fn();
    renderHook(() =>
      useCommandPaletteTrigger({ onOpen, shortcut: null, event: null })
    );

    press('k');
    window.dispatchEvent(new CustomEvent('open-command-palette'));

    expect(onOpen).not.toHaveBeenCalled();
  });
});
