export const CoworkStudioAssetStatus = {
  Ready: 'ready',
  Error: 'error',
} as const;

export type CoworkStudioAssetStatus = typeof CoworkStudioAssetStatus[keyof typeof CoworkStudioAssetStatus];

export const CoworkStudioAssetSource = {
  StarOfficeUi: 'star-office-ui',
} as const;

export type CoworkStudioAssetSource = typeof CoworkStudioAssetSource[keyof typeof CoworkStudioAssetSource];

export interface CoworkStudioAssetsResult {
  success: boolean;
  status: CoworkStudioAssetStatus;
  source: CoworkStudioAssetSource;
  commit: string;
  baseUrl: string | null;
  backgroundUrl: string | null;
  assetUrls: Record<string, string>;
  cachedFiles: string[];
  attribution: string;
  licenseUrl: string;
  error?: string;
}
