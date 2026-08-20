import { describe, expect, it } from 'vitest';
import { BaseModel } from './model.base';
import { getDeveloperDetailsFromInScopeModels } from './developer-details';
import type { DeveloperDetails } from './types';

class PlainModel extends BaseModel {}

class DetailedModel extends BaseModel {
  constructor(id: string, private readonly details: DeveloperDetails) {
    super(id);
  }

  developerDetails(): DeveloperDetails {
    return this.details;
  }
}

describe('getDeveloperDetailsFromInScopeModels', () => {
  it('returns empty when no models implement developerDetails', () => {
    expect(
      getDeveloperDetailsFromInScopeModels([
        new PlainModel('a'),
        new PlainModel('b'),
      ])
    ).toEqual([]);
  });

  it('returns sections newest-first and skips models without developerDetails', () => {
    const sections = getDeveloperDetailsFromInScopeModels([
      new PlainModel('skip'),
      new DetailedModel('older', {
        title: 'Older',
        entries: [{ key: 'ID', value: 'older' }],
      }),
      new DetailedModel('newer', {
        title: 'Newer',
        entries: [{ key: 'ID', value: 'newer' }],
      }),
    ]);

    expect(sections).toMatchObject([
      { title: 'Newer', entries: [{ key: 'ID', value: 'newer' }] },
      { title: 'Older', entries: [{ key: 'ID', value: 'older' }] },
    ]);
  });
});
