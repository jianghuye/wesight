import type { SkillMarketplaceCategory, SkillMarketplaceSort } from '../shared/skills/constants';
import { SkillMarketplaceCategory as MarketplaceCategory, SkillMarketplaceSourceType } from '../shared/skills/constants';
import type { SqliteStore } from './sqliteStore';

type LocalizedText = { en: string; zh: string };

type MarketTag = {
  id: string;
  en: string;
  zh: string;
};

export type SkillHubMarketplaceSkill = {
  id: string;
  name: string;
  description: string | LocalizedText;
  tags?: string[];
  url: string;
  version?: string;
  slug?: string;
  category?: string;
  sourceType?: string;
  rating?: number;
  stars?: number;
  hotScore?: number;
  source: {
    from: string;
    url: string;
    author?: string;
  };
};

export type SkillHubMarketplaceOptions = {
  query?: string;
  category?: string;
  sort?: SkillMarketplaceSort;
  limit?: number;
};

export type SkillHubMarketplaceResult = {
  success: boolean;
  skills: SkillHubMarketplaceSkill[];
  tags: MarketTag[];
  cached?: boolean;
  updatedAt?: number;
  error?: string;
};

type RawSkillHubSkill = {
  id?: string;
  name?: string;
  slug?: string;
  author?: string;
  description?: string | null;
  description_zh?: string | null;
  category?: string | null;
  tags?: string[] | null;
  simple_score?: number | null;
  simple_rating?: string | null;
  github_stars?: number | null;
  repo_url?: string | null;
  is_aggregator?: boolean;
};

type SkillHubCache = {
  updatedAt: number;
  skills: SkillHubMarketplaceSkill[];
  tags: MarketTag[];
};

const SKILLHUB_API_BASE = 'https://skillhub.club/api/v1';
const SKILLHUB_WEB_BASE = 'https://skillhub.lol';
const SKILLHUB_CACHE_KEY = 'skills.skillhub.marketplace.cache.v1';
const DEFAULT_MARKETPLACE_LIMIT = 120;
const REQUEST_TIMEOUT_MS = 10000;

const marketplaceTags: MarketTag[] = [
  { id: MarketplaceCategory.Featured, zh: '推荐', en: 'Featured' },
  { id: MarketplaceCategory.Coding, zh: '编程开发', en: 'Coding' },
  { id: MarketplaceCategory.Office, zh: '办公文档', en: 'Office' },
  { id: MarketplaceCategory.Data, zh: '数据分析', en: 'Data' },
  { id: MarketplaceCategory.Automation, zh: '自动化', en: 'Automation' },
  { id: MarketplaceCategory.Research, zh: '研究写作', en: 'Research' },
  { id: MarketplaceCategory.Media, zh: '设计多媒体', en: 'Media' },
  { id: MarketplaceCategory.ImOps, zh: 'IM/运营', en: 'IM & Ops' },
  { id: MarketplaceCategory.Integration, zh: '工具集成', en: 'Integrations' },
  { id: MarketplaceCategory.Other, zh: '其他', en: 'Other' },
];

const sortToSkillHubSortBy = (sort?: SkillMarketplaceSort): string => {
  switch (sort) {
    case 'latest':
      return 'recent';
    case 'stars':
      return 'stars';
    case 'rating':
    case 'trending':
    case 'recommended':
    default:
      return 'score';
  }
};

const normalizeText = (...parts: Array<string | null | undefined>): string => {
  return parts.filter(Boolean).join(' ').toLowerCase();
};

const includesAny = (text: string, keywords: string[]): boolean => {
  return keywords.some(keyword => text.includes(keyword));
};

export const mapSkillHubCategory = (skill: Pick<RawSkillHubSkill, 'category' | 'tags' | 'name' | 'description' | 'description_zh'>): SkillMarketplaceCategory => {
  const rawCategory = (skill.category || '').toLowerCase();
  const tags = Array.isArray(skill.tags) ? skill.tags.join(' ') : '';
  const text = normalizeText(rawCategory, tags, skill.name, skill.description || undefined, skill.description_zh || undefined);

  if (includesAny(text, ['frontend', 'backend', 'development', 'coding', 'code', 'repo', 'git', 'terraform', 'devops'])) {
    return MarketplaceCategory.Coding;
  }
  if (includesAny(text, ['office', 'document', 'docx', 'xlsx', 'spreadsheet', 'ppt', 'pptx', 'pdf', 'excel', 'word', 'presentation'])) {
    return MarketplaceCategory.Office;
  }
  if (includesAny(text, ['data', 'analytics', 'analysis', 'database', 'sql', 'ai-ml', 'evaluation', 'machine learning'])) {
    return MarketplaceCategory.Data;
  }
  if (includesAny(text, ['automation', 'workflow', 'cron', 'scheduler', 'pipeline', 'scraping', 'agent workflow'])) {
    return MarketplaceCategory.Automation;
  }
  if (includesAny(text, ['research', 'writing', 'docs', 'writer', 'content', 'paper', 'academic', 'summarize'])) {
    return MarketplaceCategory.Research;
  }
  if (includesAny(text, ['design', 'media', 'image', 'video', 'audio', 'tts', 'voice', 'figma', 'ux', 'ui'])) {
    return MarketplaceCategory.Media;
  }
  if (includesAny(text, ['im', 'feishu', 'slack', 'discord', 'telegram', 'wechat', 'seo', 'marketing', 'growth', 'social'])) {
    return MarketplaceCategory.ImOps;
  }
  if (includesAny(text, ['api', 'integration', 'mcp', 'cloud', 'github', 'openai', 'google', 'notion', 'jira'])) {
    return MarketplaceCategory.Integration;
  }
  return MarketplaceCategory.Other;
};

export const normalizeSkillHubSkill = (skill: RawSkillHubSkill): SkillHubMarketplaceSkill | null => {
  const slug = skill.slug?.trim();
  if (!slug) return null;

  const category = mapSkillHubCategory(skill);
  const rawTags = Array.isArray(skill.tags) ? skill.tags.filter(Boolean) : [];
  const tags = Array.from(new Set([category, skill.category || '', ...rawTags].filter(Boolean)));
  const description = skill.description || skill.description_zh || skill.name || slug;
  const zhDescription = skill.description_zh || skill.description || description;
  const sourceUrl = `${SKILLHUB_WEB_BASE}/skills/${encodeURIComponent(slug)}`;

  return {
    id: slug,
    slug,
    name: skill.name || slug,
    description: {
      en: description,
      zh: zhDescription,
    },
    tags,
    url: `skillhub:${slug}`,
    category,
    sourceType: SkillMarketplaceSourceType.SkillHub,
    rating: typeof skill.simple_score === 'number' ? skill.simple_score : undefined,
    stars: typeof skill.github_stars === 'number' ? skill.github_stars : undefined,
    hotScore: typeof skill.simple_score === 'number' ? Math.round(skill.simple_score * 10) : undefined,
    source: {
      from: 'SkillHub',
      url: sourceUrl,
      author: skill.author || undefined,
    },
  };
};

const filterMarketplaceSkills = (
  skills: SkillHubMarketplaceSkill[],
  options: SkillHubMarketplaceOptions,
): SkillHubMarketplaceSkill[] => {
  let result = [...skills];
  const category = options.category;
  if (category && category !== 'all' && category !== MarketplaceCategory.Featured) {
    result = result.filter(skill => skill.category === category || skill.tags?.includes(category));
  }
  if (category === MarketplaceCategory.Featured) {
    const featured = result.filter(skill => (skill.rating ?? 0) >= 8 || (skill.stars ?? 0) >= 1000);
    if (featured.length > 0) {
      result = featured;
    }
  }
  return sortMarketplaceSkills(result, options.sort).slice(0, options.limit ?? DEFAULT_MARKETPLACE_LIMIT);
};

export const sortMarketplaceSkills = (
  skills: SkillHubMarketplaceSkill[],
  sort: SkillMarketplaceSort = 'recommended',
): SkillHubMarketplaceSkill[] => {
  const sorted = [...skills];
  switch (sort) {
    case 'latest':
      return sorted;
    case 'stars':
      return sorted.sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0));
    case 'rating':
      return sorted.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    case 'trending':
      return sorted.sort((a, b) => (b.hotScore ?? b.rating ?? 0) - (a.hotScore ?? a.rating ?? 0));
    case 'recommended':
    default:
      return sorted.sort((a, b) => {
        const scoreA = (a.rating ?? 0) * 100 + Math.log10((a.stars ?? 0) + 1);
        const scoreB = (b.rating ?? 0) * 100 + Math.log10((b.stars ?? 0) + 1);
        return scoreB - scoreA;
      });
  }
};

const fetchJsonWithTimeout = async (url: string, init?: RequestInit): Promise<unknown> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.headers ?? {}),
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  } finally {
    clearTimeout(timer);
  }
};

const readSkillsFromPayload = (payload: unknown): RawSkillHubSkill[] => {
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  const skills = record.skills;
  if (Array.isArray(skills)) return skills as RawSkillHubSkill[];
  return [];
};

const fetchSkillHubSkills = async (options: SkillHubMarketplaceOptions): Promise<SkillHubMarketplaceSkill[]> => {
  const limit = options.limit ?? DEFAULT_MARKETPLACE_LIMIT;
  const query = options.query?.trim();
  const rawSkills = query
    ? readSkillsFromPayload(await fetchJsonWithTimeout(`${SKILLHUB_API_BASE}/desktop/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit }),
      }))
    : readSkillsFromPayload(await fetchJsonWithTimeout(
        `${SKILLHUB_API_BASE}/desktop/catalog?limit=${encodeURIComponent(String(limit))}&sortBy=${encodeURIComponent(sortToSkillHubSortBy(options.sort))}`
      ));

  return rawSkills
    .map(normalizeSkillHubSkill)
    .filter((skill): skill is SkillHubMarketplaceSkill => Boolean(skill));
};

export const fetchSkillHubMarketplace = async (
  store: SqliteStore,
  options: SkillHubMarketplaceOptions = {},
): Promise<SkillHubMarketplaceResult> => {
  try {
    const fetched = await fetchSkillHubSkills(options);
    const skills = filterMarketplaceSkills(fetched, options);
    const cache: SkillHubCache = {
      updatedAt: Date.now(),
      skills: fetched,
      tags: marketplaceTags,
    };
    store.set(SKILLHUB_CACHE_KEY, cache);
    return {
      success: true,
      skills,
      tags: marketplaceTags,
      cached: false,
      updatedAt: cache.updatedAt,
    };
  } catch (error) {
    const cached = store.get<SkillHubCache>(SKILLHUB_CACHE_KEY);
    if (cached?.skills?.length) {
      return {
        success: true,
        skills: filterMarketplaceSkills(cached.skills, options),
        tags: cached.tags?.length ? cached.tags : marketplaceTags,
        cached: true,
        updatedAt: cached.updatedAt,
        error: error instanceof Error ? error.message : 'Failed to fetch SkillHub marketplace',
      };
    }
    return {
      success: false,
      skills: [],
      tags: marketplaceTags,
      error: error instanceof Error ? error.message : 'Failed to fetch SkillHub marketplace',
    };
  }
};

export const __skillHubMarketplaceTestUtils = {
  filterMarketplaceSkills,
  mapSkillHubCategory,
  normalizeSkillHubSkill,
  sortMarketplaceSkills,
};
