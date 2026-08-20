import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useCustomWindowEvents } from './use-window-events';

describe('useCustomWindowEvents', () => {
  let addEventListenerSpy: any;
  let removeEventListenerSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('listeners get unbound when component unmounts', () => {
    it('should remove event listeners on unmount', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      const { unmount } = renderHook(() =>
        useCustomWindowEvents([
          {
            event: 'custom-event-1',
            callback: callback1,
          },
          {
            event: 'custom-event-2',
            callback: callback2,
          },
        ])
      );

      // Verify listeners were added
      expect(addEventListenerSpy).toHaveBeenCalledTimes(2);
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'custom-event-1',
        expect.any(Function),
        false
      );
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'custom-event-2',
        expect.any(Function),
        false
      );

      // Unmount the component
      unmount();

      // Verify listeners were removed
      expect(removeEventListenerSpy).toHaveBeenCalledTimes(2);
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'custom-event-1',
        expect.any(Function),
        false
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'custom-event-2',
        expect.any(Function),
        false
      );
    });

    it('should remove event listeners with capture option on unmount', () => {
      const callback = vi.fn();

      const { unmount } = renderHook(() =>
        useCustomWindowEvents(
          [
            {
              event: 'custom-event',
              callback,
            },
          ],
          { capture: true }
        )
      );

      // Verify listener was added with capture
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'custom-event',
        expect.any(Function),
        true
      );

      // Unmount the component
      unmount();

      // Verify listener was removed with capture
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'custom-event',
        expect.any(Function),
        true
      );
    });
  });

  describe('can have multiple listeners for a given event', () => {
    it('should execute all callbacks when the same event is dispatched', async () => {
      let resolveAllCalled: () => void;
      const allCalled = new Promise((resolve) => {
        let count = 0;
        resolveAllCalled = () => {
          count++;
          if (count === 3) {
            resolve(true);
          }
        };
      });
      const callback1 = vi.fn(() => {
        resolveAllCalled();
        return Promise.resolve();
      });
      const callback2 = vi.fn(() => {
        resolveAllCalled();
        return Promise.resolve();
      });
      const callback3 = vi.fn(() => {
        resolveAllCalled();
        return Promise.resolve();
      });

      renderHook(() =>
        useCustomWindowEvents([
          {
            event: 'multi-event',
            callback: callback1,
          },
          {
            event: 'multi-event',
            callback: callback2,
          },
          {
            event: 'multi-event',
            callback: callback3,
          },
        ])
      );

      // Dispatch the event
      const customEvent = new CustomEvent('multi-event', {
        detail: { test: 'data' },
      });
      window.dispatchEvent(customEvent);

      await allCalled;

      // Verify all callbacks were called
      expect(callback1).toHaveBeenCalledWith(customEvent);
      expect(callback2).toHaveBeenCalledWith(customEvent);
      expect(callback3).toHaveBeenCalledWith(customEvent);
    });
  });

  describe('callbacks only execute if the available func is defined and returns true', () => {
    it('should execute callback when available function returns true', () => {
      const callback = vi.fn();
      const available = vi.fn().mockReturnValue(true);

      renderHook(() =>
        useCustomWindowEvents([
          {
            event: 'available-event',
            available,
            callback,
          },
        ])
      );

      // Dispatch the event
      const customEvent = new CustomEvent('available-event', {
        detail: { test: 'data' },
      });
      window.dispatchEvent(customEvent);

      // Verify available function was called and callback executed
      expect(available).toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(customEvent);
    });

    it('should not execute callback when available function returns false', () => {
      const callback = vi.fn();
      const available = vi.fn().mockReturnValue(false);

      renderHook(() =>
        useCustomWindowEvents([
          {
            event: 'unavailable-event',
            available,
            callback,
          },
        ])
      );

      // Dispatch the event
      const customEvent = new CustomEvent('unavailable-event', {
        detail: { test: 'data' },
      });
      window.dispatchEvent(customEvent);

      // Verify available function was called but callback was not executed
      expect(available).toHaveBeenCalled();
      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle multiple events with different available conditions', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const available1 = vi.fn().mockReturnValue(true);
      const available2 = vi.fn().mockReturnValue(false);

      renderHook(() =>
        useCustomWindowEvents([
          {
            event: 'event-1',
            available: available1,
            callback: callback1,
          },
          {
            event: 'event-2',
            available: available2,
            callback: callback2,
          },
        ])
      );

      // Dispatch events
      const customEvent1 = new CustomEvent('event-1', {
        detail: { test: 'data1' },
      });
      const customEvent2 = new CustomEvent('event-2', {
        detail: { test: 'data2' },
      });

      window.dispatchEvent(customEvent1);
      window.dispatchEvent(customEvent2);

      // Verify only the available callback was executed
      expect(available1).toHaveBeenCalled();
      expect(available2).toHaveBeenCalled();
      expect(callback1).toHaveBeenCalledWith(customEvent1);
      expect(callback2).not.toHaveBeenCalled();
    });
  });

  describe('callbacks fire if the available callback is undefined', () => {
    it('should execute callback when available function is undefined', () => {
      const callback = vi.fn();

      renderHook(() =>
        useCustomWindowEvents([
          {
            event: 'undefined-available-event',
            callback,
          },
        ])
      );

      // Dispatch the event
      const customEvent = new CustomEvent('undefined-available-event', {
        detail: { test: 'data' },
      });
      window.dispatchEvent(customEvent);

      // Verify callback was executed
      expect(callback).toHaveBeenCalledWith(customEvent);
    });

    it('should execute callback when available property is not provided', () => {
      const callback = vi.fn();

      renderHook(() =>
        useCustomWindowEvents([
          {
            event: 'no-available-event',
            callback,
          },
        ])
      );

      // Dispatch the event
      const customEvent = new CustomEvent('no-available-event', {
        detail: { test: 'data' },
      });
      window.dispatchEvent(customEvent);

      // Verify callback was executed
      expect(callback).toHaveBeenCalledWith(customEvent);
    });

    it('should handle mix of defined and undefined available functions', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const available1 = vi.fn().mockReturnValue(true);

      renderHook(() =>
        useCustomWindowEvents([
          {
            event: 'event-with-available',
            available: available1,
            callback: callback1,
          },
          {
            event: 'event-without-available',
            callback: callback2,
          },
        ])
      );

      // Dispatch events
      const customEvent1 = new CustomEvent('event-with-available', {
        detail: { test: 'data1' },
      });
      const customEvent2 = new CustomEvent('event-without-available', {
        detail: { test: 'data2' },
      });

      window.dispatchEvent(customEvent1);
      window.dispatchEvent(customEvent2);

      // Verify both callbacks were executed
      expect(available1).toHaveBeenCalled();
      expect(callback1).toHaveBeenCalledWith(customEvent1);
      expect(callback2).toHaveBeenCalledWith(customEvent2);
    });
  });

  describe('event handling options', () => {
    it('should handle preventDefault option', () => {
      const callback = vi.fn();
      const preventDefaultSpy = vi.fn();

      renderHook(() =>
        useCustomWindowEvents(
          [
            {
              event: 'prevent-default-event',
              callback,
            },
          ],
          { preventDefault: true }
        )
      );

      // Dispatch the event
      const customEvent = new CustomEvent('prevent-default-event', {
        detail: { test: 'data' },
      });
      customEvent.preventDefault = preventDefaultSpy;
      window.dispatchEvent(customEvent);

      // Verify preventDefault was called
      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(customEvent);
    });

    it('should handle stopPropagation option', () => {
      const callback = vi.fn();
      const stopPropagationSpy = vi.fn();

      renderHook(() =>
        useCustomWindowEvents(
          [
            {
              event: 'stop-propagation-event',
              callback,
            },
          ],
          { stopPropagation: true }
        )
      );

      // Dispatch the event
      const customEvent = new CustomEvent('stop-propagation-event', {
        detail: { test: 'data' },
      });
      customEvent.stopPropagation = stopPropagationSpy;
      window.dispatchEvent(customEvent);

      // Verify stopPropagation was called
      expect(stopPropagationSpy).toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(customEvent);
    });

    it('should handle async callbacks', async () => {
      const callback = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      renderHook(() =>
        useCustomWindowEvents([
          {
            event: 'async-event',
            callback,
          },
        ])
      );

      // Dispatch the event
      const customEvent = new CustomEvent('async-event', {
        detail: { test: 'data' },
      });
      window.dispatchEvent(customEvent);

      // Verify callback was called
      expect(callback).toHaveBeenCalledWith(customEvent);
    });
  });

  describe('edge cases', () => {
    it('should handle empty events array', () => {
      renderHook(() => useCustomWindowEvents([]));

      // Verify no listeners were added
      expect(addEventListenerSpy).not.toHaveBeenCalled();
    });

    it('should handle non-CustomEvent events gracefully', () => {
      const callback = vi.fn();

      renderHook(() =>
        useCustomWindowEvents([
          {
            event: 'regular-event',
            callback,
          },
        ])
      );

      // Dispatch a regular Event (not CustomEvent)
      const regularEvent = new Event('regular-event');
      window.dispatchEvent(regularEvent);

      // Verify callback was not called since it's not a CustomEvent
      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle multiple renders with different events', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      const { rerender } = renderHook(
        ({ events }) => useCustomWindowEvents(events),
        {
          initialProps: {
            events: [
              {
                event: 'event-1',
                callback: callback1,
              },
            ],
          },
        }
      );

      // Verify first listener was added
      expect(addEventListenerSpy).toHaveBeenCalledTimes(1);
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'event-1',
        expect.any(Function),
        false
      );

      // Rerender with different events
      rerender({
        events: [
          {
            event: 'event-2',
            callback: callback2,
          },
        ],
      });

      // Verify old listener was removed and new one was added
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'event-1',
        expect.any(Function),
        false
      );
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'event-2',
        expect.any(Function),
        false
      );
    });
  });
});
