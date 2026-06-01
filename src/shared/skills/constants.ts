export const SkillsIpcChannel = {
  List: 'skills:list',
  SetEnabled: 'skills:setEnabled',
  Delete: 'skills:delete',
  Download: 'skills:download',
  Upgrade: 'skills:upgrade',
  ConfirmInstall: 'skills:confirmInstall',
  GetRoot: 'skills:getRoot',
  AutoRoutingPrompt: 'skills:autoRoutingPrompt',
  GetConfig: 'skills:getConfig',
  SetConfig: 'skills:setConfig',
  TestEmailConnectivity: 'skills:testEmailConnectivity',
  FetchMarketplace: 'skills:fetchMarketplace',
  SearchMarketplace: 'skills:searchMarketplace',
  InstallMarketplaceSkill: 'skills:installMarketplaceSkill',
  Changed: 'skills:changed',
} as const;

export type SkillsIpcChannel = typeof SkillsIpcChannel[keyof typeof SkillsIpcChannel];

export const SkillMarketplaceSourceType = {
  SkillHub: 'skillhub',
  ClawHub: 'clawhub',
  GitHub: 'github',
} as const;

export type SkillMarketplaceSourceType =
  typeof SkillMarketplaceSourceType[keyof typeof SkillMarketplaceSourceType];

export const SkillMarketplaceSort = {
  Recommended: 'recommended',
  Latest: 'latest',
  Trending: 'trending',
  Rating: 'rating',
  Stars: 'stars',
} as const;

export type SkillMarketplaceSort =
  typeof SkillMarketplaceSort[keyof typeof SkillMarketplaceSort];

export const SkillMarketplaceCategory = {
  Featured: 'featured',
  Coding: 'coding',
  Office: 'office',
  Data: 'data',
  Automation: 'automation',
  Research: 'research',
  Media: 'media',
  ImOps: 'im_ops',
  Integration: 'integration',
  Other: 'other',
} as const;

export type SkillMarketplaceCategory =
  typeof SkillMarketplaceCategory[keyof typeof SkillMarketplaceCategory];
