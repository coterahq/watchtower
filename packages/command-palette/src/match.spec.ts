import { describe, expect, it } from 'vitest';
import { defaultMatcher, fuzzyScore } from './match';

describe('fuzzyScore', () => {
  it('matches characters in order, not only substrings', () => {
    expect(fuzzyScore('rql', 'Run EraQL query')).not.toBeNull();
    expect(fuzzyScore('qrl', 'Run EraQL query')).toBeNull();
  });

  it('ignores case and spaces in the query', () => {
    expect(fuzzyScore('run query', 'RunQueryAction')).not.toBeNull();
  });

  it('scores a prefix above a match buried in the middle', () => {
    const prefix = fuzzyScore('save', 'Save document')!;
    const buried = fuzzyScore('save', 'Autosave the draft')!;

    expect(prefix).toBeGreaterThan(buried);
  });

  it('scores an adjacent run above scattered characters', () => {
    const adjacent = fuzzyScore('doc', 'Open doc')!;
    const scattered = fuzzyScore('doc', 'Delete other charts')!;

    expect(adjacent).toBeGreaterThan(scattered);
  });

  it('prefers the shorter of two equally good matches', () => {
    const short = fuzzyScore('run', 'Run')!;
    const long = fuzzyScore('run', 'Run this workflow again please')!;

    expect(short).toBeGreaterThan(long);
  });

  it('treats an empty query as matching everything', () => {
    expect(fuzzyScore('', 'anything')).toBe(0);
  });
});

describe('defaultMatcher', () => {
  const candidates = [
    { title: 'Delete row' },
    { title: 'Save document', description: 'Write it to the server' },
    { title: 'Save as…' },
  ];

  it('returns matching indexes, best first', () => {
    expect(defaultMatcher('save', candidates)).toEqual([2, 1]);
  });

  it('matches on the description too, but weighted below the title', () => {
    const bySelf = defaultMatcher('server', candidates);
    expect(bySelf).toEqual([1]);

    // Title beats description for the same query.
    const both = defaultMatcher('s', [
      { title: 'Write it', description: 'server' },
      { title: 'Server' },
    ]);
    expect(both[0]).toBe(1);
  });

  it('drops candidates that do not match at all', () => {
    expect(defaultMatcher('zzz', candidates)).toEqual([]);
  });
});
