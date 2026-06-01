import type { SkillMarketplaceSort, SkillMarketplaceSourceType } from '@shared/skills/constants';

// Skill type definition
export interface Skill {
  id: string;
  name: string;
  description: string;
  enabled: boolean;       // Whether visible in popover
  isOfficial: boolean;    // "官方" badge
  isBuiltIn: boolean;     // Bundled with app, cannot be deleted
  updatedAt: number;      // Timestamp
  prompt: string;         // System prompt content
  skillPath: string;      // Absolute path to SKILL.md
  version?: string;       // Skill version from SKILL.md frontmatter
}

export type LocalizedText = { en: string; zh: string };

export interface MarketTag {
  id: string;
  en: string;
  zh: string;
}

export interface LocalSkillInfo {
  id: string;
  name: string;
  description: string | LocalizedText;
  version: string;
}

export interface MarketplaceSkill {
  id: string;
  name: string;
  description: string | LocalizedText;
  tags?: string[];
  url: string;              // Download source, e.g. zip URL or skillhub:<slug>
  version?: string;
  slug?: string;
  category?: string;
  sourceType?: SkillMarketplaceSourceType;
  rating?: number;
  stars?: number;
  hotScore?: number;
  source: {
    from: string;           // e.g. "Github"
    url: string;            // Source repo URL
    author?: string;        // Author name
  };
}

export interface SkillMarketplaceOptions {
  query?: string;
  category?: string;
  sort?: SkillMarketplaceSort;
  limit?: number;
}
