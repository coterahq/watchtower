import type { CommandPaletteCandidate, CommandPaletteMatcher } from './types';

/** A description matching counts, but never as much as the title matching. */
const DESCRIPTION_WEIGHT = 0.5;

const SEPARATORS = new Set([
  ' ',
  '-',
  '_',
  '/',
  '.',
  ':',
  ',',
  '(',
  ')',
  '[',
  ']',
]);

function isWordStart(previous: string | undefined): boolean {
  return previous === undefined || SEPARATORS.has(previous);
}

/**
 * Scores `query` against `text`, or returns null when the characters are not
 * all there in order.
 *
 * Subsequence matching, so "rql" finds "Run EraQL query", with the scoring
 * doing the work a plain `includes` cannot: a run of adjacent characters, or
 * one that starts a word, is worth more than the same letters scattered
 * through the middle of the string.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) {
    return 0;
  }

  const haystack = text.toLowerCase();
  let score = 0;
  let cursor = 0;
  let previousMatch = -2;

  for (const character of needle) {
    // Spaces separate words of the query; they do not have to appear in the
    // text, so "run query" still matches "RunQueryAction".
    if (character === ' ') {
      continue;
    }

    const found = haystack.indexOf(character, cursor);
    if (found === -1) {
      return null;
    }

    if (found === previousMatch + 1) {
      score += 8;
    } else if (isWordStart(haystack[found - 1])) {
      score += 5;
    } else {
      score += 1;
    }

    // How much had to be skipped to get here, capped so one long gap does not
    // sink an otherwise good match.
    score -= Math.min(found - cursor, 8) * 0.5;

    previousMatch = found;
    cursor = found + 1;
  }

  const contiguous = haystack.indexOf(needle);
  if (contiguous === 0) {
    score += 16;
  } else if (contiguous > 0) {
    score += 8;
  }

  // Between two texts that matched equally well, the shorter one is the more
  // specific answer.
  return score - haystack.length * 0.01;
}

/**
 * The palette's default ranking: fuzzy over the title, and over the description
 * at half weight. Replace it via `matcher` to hand the job to Fuse.js or
 * anything else that can rank by index.
 */
export const defaultMatcher: CommandPaletteMatcher = (query, candidates) => {
  const scored: { index: number; score: number }[] = [];

  candidates.forEach((candidate: CommandPaletteCandidate, index: number) => {
    const title = fuzzyScore(query, candidate.title);
    const description =
      candidate.description === undefined
        ? null
        : fuzzyScore(query, candidate.description);

    const best = Math.max(
      title ?? Number.NEGATIVE_INFINITY,
      description === null
        ? Number.NEGATIVE_INFINITY
        : description * DESCRIPTION_WEIGHT
    );

    if (Number.isFinite(best)) {
      scored.push({ index, score: best });
    }
  });

  // Array.prototype.sort is stable, so equal scores keep registration order.
  scored.sort((a, b) => b.score - a.score);

  return scored.map((entry) => entry.index);
};
