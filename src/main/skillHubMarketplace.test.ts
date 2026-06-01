import { expect, test } from 'vitest';

import { SkillMarketplaceCategory, SkillMarketplaceSort } from '../shared/skills/constants';
import { __skillHubMarketplaceTestUtils } from './skillHubMarketplace';

const { filterMarketplaceSkills, mapSkillHubCategory, normalizeSkillHubSkill, sortMarketplaceSkills } =
  __skillHubMarketplaceTestUtils;

type NormalizedSkill = NonNullable<ReturnType<typeof normalizeSkillHubSkill>>;

const compactSkills = (skills: Array<NormalizedSkill | null>): NormalizedSkill[] => {
  return skills.filter((skill): skill is NormalizedSkill => Boolean(skill));
};

test('skillhub marketplace maps development skills to coding', () => {
  expect(mapSkillHubCategory({
    category: 'Development',
    tags: ['frontend'],
    name: 'React Builder',
    description: 'Build code',
    description_zh: null,
  })).toBe(SkillMarketplaceCategory.Coding);
});

test('skillhub marketplace maps document skills to office', () => {
  expect(mapSkillHubCategory({
    category: 'Productivity',
    tags: ['xlsx', 'pptx'],
    name: 'Office Pack',
    description: 'Create spreadsheets and presentations',
    description_zh: null,
  })).toBe(SkillMarketplaceCategory.Office);
});

test('skillhub marketplace normalizes raw skills into WeSight cards', () => {
  const skill = normalizeSkillHubSkill({
    name: 'Docs Writer',
    slug: 'docs-writer',
    author: 'SkillHub',
    description: 'Write docs',
    description_zh: '写文档',
    category: 'writing',
    tags: ['markdown'],
    simple_score: 8.6,
    github_stars: 1280,
  });

  expect(skill).toMatchObject({
    id: 'docs-writer',
    slug: 'docs-writer',
    name: 'Docs Writer',
    url: 'skillhub:docs-writer',
    sourceType: 'skillhub',
    rating: 8.6,
    stars: 1280,
    source: {
      from: 'SkillHub',
      author: 'SkillHub',
      url: 'https://skillhub.lol/skills/docs-writer',
    },
  });
  expect(skill?.description).toEqual({ en: 'Write docs', zh: '写文档' });
});

test('skillhub marketplace filters by category and keeps featured fallback usable', () => {
  const codingSkill = normalizeSkillHubSkill({
    name: 'Code Helper',
    slug: 'code-helper',
    category: 'development',
    tags: ['coding'],
    simple_score: 4,
  });
  const officeSkill = normalizeSkillHubSkill({
    name: 'Sheet Helper',
    slug: 'sheet-helper',
    category: 'office',
    tags: ['xlsx'],
    simple_score: 9,
  });

  const skills = compactSkills([codingSkill, officeSkill]);
  const filtered = filterMarketplaceSkills(skills, {
    category: SkillMarketplaceCategory.Office,
    sort: SkillMarketplaceSort.Recommended,
  });
  const featured = filterMarketplaceSkills(skills, {
    category: SkillMarketplaceCategory.Featured,
    sort: SkillMarketplaceSort.Recommended,
  });

  expect(filtered.map(skill => skill.id)).toEqual(['sheet-helper']);
  expect(featured.map(skill => skill.id)).toEqual(['sheet-helper']);
});

test('skillhub marketplace sorts by stars', () => {
  const first = normalizeSkillHubSkill({ name: 'Small', slug: 'small', github_stars: 1 });
  const second = normalizeSkillHubSkill({ name: 'Popular', slug: 'popular', github_stars: 100 });

  const sorted = sortMarketplaceSkills(
    compactSkills([first, second]),
    SkillMarketplaceSort.Stars,
  );

  expect(sorted.map(skill => skill.id)).toEqual(['popular', 'small']);
});
