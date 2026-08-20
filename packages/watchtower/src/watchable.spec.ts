import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PollingWatchable, StalenessWatchable, Watchable } from './watchable';

describe('Watchable', () => {
  describe('Basic functionality', () => {
    it('should create a watchable with initial value', () => {
      const watchable = Watchable.fromValue(42);
      expect(watchable.snapshot()).toBe(42);
    });

    it('should update value with set', () => {
      const watchable = Watchable.fromValue(42);
      watchable.set(100);
      expect(watchable.snapshot()).toBe(100);
    });

    it('setFromSource updates value without invoking updater', () => {
      const updater = vi.fn((x: number) => x);
      const watchable = Watchable.fromValue(0, { updater });
      updater.mockClear();
      watchable.setFromSource(10);
      expect(watchable.snapshot()).toBe(10);
      expect(updater).not.toHaveBeenCalled();
      watchable.set(20);
      expect(updater).toHaveBeenCalledWith(20);
    });

    it('should handle object values', () => {
      const user = { name: 'John', age: 30 };
      const watchable = Watchable.fromValue(user);

      expect(watchable.snapshot()).toEqual(user);

      const newUser = { name: 'Jane', age: 25 };
      watchable.set(newUser);

      expect(watchable.snapshot()).toEqual(newUser);
    });
  });

  describe('Static from method', () => {
    it('should create derived watchable using static from method', () => {
      const userWatchable = Watchable.fromValue({ name: 'John', age: 30 });
      const nameWatchable = Watchable.from((get) => get(userWatchable).name);

      expect(nameWatchable.snapshot()).toBe('John');
    });

    it('should update when source watchable changes', () => {
      const userWatchable = Watchable.fromValue({ name: 'John', age: 30 });
      const nameWatchable = Watchable.from((get) => get(userWatchable).name);

      userWatchable.set({ name: 'Jane', age: 25 });

      expect(nameWatchable.snapshot()).toBe('Jane');
    });

    it('should combine multiple watchables', () => {
      const userWatchable = Watchable.fromValue({ name: 'John', age: 30 });
      const settingsWatchable = Watchable.fromValue({ theme: 'dark' });

      const displayWatchable = Watchable.from((get) => {
        const user = get(userWatchable);
        const settings = get(settingsWatchable);
        return `${user.name} (${settings.theme})`;
      });

      expect(displayWatchable.snapshot()).toBe('John (dark)');
    });

    it('should update when any source watchable changes', () => {
      const userWatchable = Watchable.fromValue({ name: 'John', age: 30 });
      const settingsWatchable = Watchable.fromValue({ theme: 'dark' });

      const displayWatchable = Watchable.from((get) => {
        const user = get(userWatchable);
        const settings = get(settingsWatchable);
        return `${user.name} (${settings.theme})`;
      });

      // Change user
      userWatchable.set({ name: 'Jane', age: 25 });
      expect(displayWatchable.snapshot()).toBe('Jane (dark)');

      // Change settings
      settingsWatchable.set({ theme: 'light' });
      expect(displayWatchable.snapshot()).toBe('Jane (light)');
    });

    it('should handle complex derived logic', () => {
      const userWatchable = Watchable.fromValue({
        name: 'John',
        age: 30,
        email: 'john@example.com',
      });
      const settingsWatchable = Watchable.fromValue({
        notifications: true,
        theme: 'dark',
      });

      const canNotifyWatchable = Watchable.from((get) => {
        const user = get(userWatchable);
        const settings = get(settingsWatchable);
        return (
          user.age >= 18 && settings.notifications && user.email.includes('@')
        );
      });

      expect(canNotifyWatchable.snapshot()).toBe(true);

      // Disable notifications
      settingsWatchable.set({ notifications: false, theme: 'dark' });
      expect(canNotifyWatchable.snapshot()).toBe(false);

      settingsWatchable.set({ notifications: true, theme: 'dark' });
      userWatchable.set({ name: 'Kid', age: 16, email: 'kid@example.com' });
      expect(canNotifyWatchable.snapshot()).toBe(false);
    });
  });

  describe('Nested derived watchables', () => {
    it('should handle derived watchables from other derived watchables', () => {
      const userWatchable = Watchable.fromValue({
        firstName: 'John',
        lastName: 'Doe',
        age: 30,
      });

      const fullNameWatchable = Watchable.from((get) => {
        const user = get(userWatchable);
        return `${user.firstName} ${user.lastName}`;
      });

      const greetingWatchable = Watchable.from((get) => {
        const fullName = get(fullNameWatchable);
        const user = get(userWatchable);
        return user.age >= 18
          ? `Hello, Mr/Ms ${fullName}`
          : `Hello, ${fullName}`;
      });

      expect(greetingWatchable.snapshot()).toBe('Hello, Mr/Ms John Doe');

      userWatchable.set({ firstName: 'Jane', lastName: 'Smith', age: 16 });
      expect(greetingWatchable.snapshot()).toBe('Hello, Jane Smith');
    });
  });

  describe('Edge cases', () => {
    it('should handle undefined/null values', () => {
      const watchable = Watchable.fromValue<string | null>(null);
      expect(watchable.snapshot()).toBe(null);

      const derivedWatchable = Watchable.from((get) => {
        const value = get(watchable);
        return value ? value.toUpperCase() : 'EMPTY';
      });

      expect(derivedWatchable.snapshot()).toBe('EMPTY');

      watchable.set('hello');
      expect(derivedWatchable.snapshot()).toBe('HELLO');
    });

    it('should handle rapid successive updates', () => {
      const watchable = Watchable.fromValue(0);

      for (let i = 1; i <= 5; i++) {
        watchable.set(i);
      }

      expect(watchable.snapshot()).toBe(5);
    });
  });
});

describe(PollingWatchable.name, () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops polling when unsubscribe is called before in-flight poll resolves', async () => {
    let resolvePoll: (value: number) => void;
    const pollFn = vi.fn(
      (_get) =>
        new Promise<number>((resolve) => {
          resolvePoll = resolve;
        })
    );

    const watchable = PollingWatchable.create(pollFn, {
      intervalMs: 100,
      initialValue: 0,
    });

    expect(pollFn).toHaveBeenCalledTimes(1);

    watchable.unsubscribe();

    resolvePoll!(1);

    await vi.advanceTimersByTimeAsync(200);

    expect(pollFn).toHaveBeenCalledTimes(1);
  });

  it('resumes polling when restart is called after unsubscribe', async () => {
    const pollFn = vi.fn((_get) => Promise.resolve(1));

    const watchable = PollingWatchable.create(pollFn, {
      intervalMs: 100,
      initialValue: 0,
    });

    expect(pollFn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(watchable.snapshot()).toBe(1);

    watchable.unsubscribe();
    await vi.advanceTimersByTimeAsync(200);
    expect(pollFn).toHaveBeenCalledTimes(1);

    watchable.restart();
    await vi.advanceTimersByTimeAsync(0);
    expect(pollFn).toHaveBeenCalledTimes(2);
    expect(watchable.snapshot()).toBe(1);

    await vi.advanceTimersByTimeAsync(100);
    expect(pollFn).toHaveBeenCalledTimes(3);
  });
});

describe(StalenessWatchable.name, () => {
  it('should handle staleness correctly', async () => {
    const watchable = Watchable.fromValue(0);
    const other = Watchable.fromValue(1);
    const deps = [other];
    const stalenessWatchable = StalenessWatchable.forValue(watchable, deps);

    //because we use time to determine staleness, we need to wait for the time to change
    await new Promise((resolve) => setTimeout(resolve, 100));

    other.set(2);

    expect(stalenessWatchable.snapshot()).toBe('stale');
  });
});
