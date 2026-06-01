import { app, net } from 'electron';
import fs from 'fs';
import path from 'path';

import {
  CoworkStudioAssetSource,
  type CoworkStudioAssetsResult,
  CoworkStudioAssetStatus,
} from '../../shared/cowork/studioAssets';

const STAR_OFFICE_COMMIT = 'f29c107e9728a72f2635f10b4e8203b29b37221d';
const STAR_OFFICE_RAW_BASE = `https://raw.githubusercontent.com/ringhyacinth/Star-Office-UI/${STAR_OFFICE_COMMIT}`;
const STAR_OFFICE_LICENSE_URL = 'https://github.com/ringhyacinth/Star-Office-UI/blob/master/LICENSE';
const STAR_OFFICE_ATTRIBUTION = 'Office scene preview assets from Star-Office-UI by Ring Hyacinth and Simon Lee.';
const BACKGROUND_ASSET_KEY = 'officeBackground';

const REQUIRED_ASSETS = [
  { key: BACKGROUND_ASSET_KEY, relativePath: 'assets/room-reference.webp', mimeType: 'image/webp' },
  { key: 'desk', relativePath: 'frontend/desk-v3.webp', mimeType: 'image/webp' },
  { key: 'sofaIdle', relativePath: 'frontend/sofa-idle-v3.png', mimeType: 'image/png' },
  { key: 'sofaShadow', relativePath: 'frontend/sofa-shadow-v1.png', mimeType: 'image/png' },
  { key: 'plants', relativePath: 'frontend/plants-spritesheet.webp', mimeType: 'image/webp' },
  { key: 'posters', relativePath: 'frontend/posters-spritesheet.webp', mimeType: 'image/webp' },
  { key: 'coffeeMachine', relativePath: 'frontend/coffee-machine-v3-grid.webp', mimeType: 'image/webp' },
  { key: 'serverroom', relativePath: 'frontend/serverroom-spritesheet.webp', mimeType: 'image/webp' },
  { key: 'cats', relativePath: 'frontend/cats-spritesheet.webp', mimeType: 'image/webp' },
] as const;

let ensurePromise: Promise<CoworkStudioAssetsResult> | null = null;

const ensureDirectory = async (dirPath: string): Promise<void> => {
  await fs.promises.mkdir(dirPath, { recursive: true });
};

const toLocalFileUrl = (filePath: string): string => {
  const normalizedPath = filePath.split(path.sep).join('/');
  return `localfile://${encodeURI(normalizedPath)}`;
};

const toImageDataUrl = async (filePath: string, mimeType: string): Promise<string> => {
  const data = await fs.promises.readFile(filePath);
  return `data:${mimeType};base64,${data.toString('base64')}`;
};

const getStudioAssetRoot = (): string => (
  path.join(app.getPath('userData'), 'cowork-studio-assets', STAR_OFFICE_COMMIT)
);

const isUsableFile = async (filePath: string): Promise<boolean> => {
  try {
    const stat = await fs.promises.stat(filePath);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
};

const downloadFile = async (relativePath: string, targetPath: string): Promise<void> => {
  const url = `${STAR_OFFICE_RAW_BASE}/${relativePath}`;
  const response = await net.fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${relativePath}: ${response.status} ${response.statusText}`);
  }
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length === 0) {
    throw new Error(`Downloaded ${relativePath} but received an empty file`);
  }
  await ensureDirectory(path.dirname(targetPath));
  const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  await fs.promises.writeFile(tempPath, data);
  await fs.promises.rename(tempPath, targetPath);
};

const buildResult = (
  status: CoworkStudioAssetStatus,
  baseUrl: string | null,
  backgroundUrl: string | null,
  assetUrls: Record<string, string>,
  error?: string,
): CoworkStudioAssetsResult => ({
  success: status === CoworkStudioAssetStatus.Ready,
  status,
  source: CoworkStudioAssetSource.StarOfficeUi,
  commit: STAR_OFFICE_COMMIT,
  baseUrl,
  backgroundUrl,
  assetUrls,
  cachedFiles: REQUIRED_ASSETS.map((asset) => asset.relativePath),
  attribution: STAR_OFFICE_ATTRIBUTION,
  licenseUrl: STAR_OFFICE_LICENSE_URL,
  ...(error ? { error } : {}),
});

const ensureCoworkStudioAssetsInternal = async (): Promise<CoworkStudioAssetsResult> => {
  const root = getStudioAssetRoot();
  try {
    await ensureDirectory(root);
    for (const asset of REQUIRED_ASSETS) {
      const targetPath = path.join(root, asset.relativePath);
      if (!(await isUsableFile(targetPath))) {
        await downloadFile(asset.relativePath, targetPath);
      }
    }
    const assetUrls: Record<string, string> = {};
    for (const asset of REQUIRED_ASSETS) {
      assetUrls[asset.key] = await toImageDataUrl(path.join(root, asset.relativePath), asset.mimeType);
    }
    return buildResult(
      CoworkStudioAssetStatus.Ready,
      toLocalFileUrl(root),
      assetUrls[BACKGROUND_ASSET_KEY] ?? null,
      assetUrls,
    );
  } catch (error) {
    console.error('[CoworkStudioAssets] failed to prepare preview assets:', error);
    return buildResult(
      CoworkStudioAssetStatus.Error,
      null,
      null,
      {},
      error instanceof Error ? error.message : 'Failed to prepare studio assets',
    );
  }
};

export const ensureCoworkStudioAssets = async (): Promise<CoworkStudioAssetsResult> => {
  if (!ensurePromise) {
    ensurePromise = ensureCoworkStudioAssetsInternal().finally(() => {
      ensurePromise = null;
    });
  }
  return ensurePromise;
};
