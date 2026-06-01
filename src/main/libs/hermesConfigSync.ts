import fs from 'fs';
import path from 'path';

import {
  CoworkAgentEngine,
  ExternalAgentConfigSource,
} from '../../shared/cowork/constants';
import {
  FeishuRuntimeOwnership,
  type FeishuRuntimeOwnershipType,
} from '../../shared/im/constants';
import type { CoworkConfig } from '../coworkStore';
import type { FeishuInstanceConfig } from '../im/types';
import { resolveRawApiConfig } from './claudeSettings';
import {
  buildHermesEnvForWesightModel,
  buildHermesFeishuEnvForInstances,
  buildHermesRuntimeEnvForLocalCli,
  HERMES_WESIGHT_FEISHU_ENV_BLOCK,
  HERMES_WESIGHT_MODEL_ENV_BLOCK,
  mergeHermesConfigForWesightModel,
  mergeHermesManagedDotenvBlock,
  parseHermesConfigText,
  parseHermesDotenvText,
  serializeHermesConfig,
} from './hermesConfig';
import type { HermesEngineManager, HermesEngineStatus } from './hermesEngineManager';

export interface HermesConfigSyncResult {
  success: boolean;
  changed: boolean;
  status?: HermesEngineStatus;
  error?: string;
}

type HermesConfigSyncDeps = {
  engineManager: HermesEngineManager;
  getCoworkConfig: () => CoworkConfig;
  getFeishuInstances?: () => FeishuInstanceConfig[];
  getFeishuRuntimeOwnership?: () => FeishuRuntimeOwnershipType;
};

const atomicWrite = (filePath: string, content: string, mode?: number): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, content, { encoding: 'utf8', mode });
  fs.renameSync(tmpPath, filePath);
};

const readText = (filePath: string): string => {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
};

const writeIfChanged = (filePath: string, content: string, mode?: number): boolean => {
  if (readText(filePath) === content) return false;
  atomicWrite(filePath, content, mode);
  return true;
};

export class HermesConfigSync {
  private readonly engineManager: HermesEngineManager;
  private readonly getCoworkConfig: () => CoworkConfig;
  private readonly getFeishuInstances: () => FeishuInstanceConfig[];
  private readonly getFeishuRuntimeOwnership: () => FeishuRuntimeOwnershipType;

  constructor(deps: HermesConfigSyncDeps) {
    this.engineManager = deps.engineManager;
    this.getCoworkConfig = deps.getCoworkConfig;
    this.getFeishuInstances = deps.getFeishuInstances ?? (() => []);
    this.getFeishuRuntimeOwnership = deps.getFeishuRuntimeOwnership ?? (() => FeishuRuntimeOwnership.WesightManaged);
  }

  sync(_reason: string): HermesConfigSyncResult {
    try {
      const coworkConfig = this.getCoworkConfig();
      const existingEnvText = readText(this.engineManager.getEnvPath());
      let nextEnvText = existingEnvText;
      let changedConfig = false;

      if (coworkConfig.hermesConfigSource === ExternalAgentConfigSource.LocalCli) {
        const feishuResult = this.buildFeishuEnv(coworkConfig);
        if (feishuResult.error) {
          throw new Error(feishuResult.error);
        }
        nextEnvText = mergeHermesManagedDotenvBlock(
          nextEnvText,
          HERMES_WESIGHT_FEISHU_ENV_BLOCK,
          feishuResult.env,
        );
        const envChanged = writeIfChanged(this.engineManager.getEnvPath(), nextEnvText, 0o600);
        const existingConfig = parseHermesConfigText(readText(this.engineManager.getConfigPath()));
        const env = buildHermesRuntimeEnvForLocalCli(existingConfig, parseHermesDotenvText(nextEnvText));
        this.engineManager.setSecretEnvVars(env);
        return {
          success: true,
          changed: envChanged,
        };
      }

      const apiResolution = resolveRawApiConfig();
      if (!apiResolution.config) {
        if (coworkConfig.agentEngine === CoworkAgentEngine.Hermes) {
          throw new Error(apiResolution.error || 'No WeSight model is configured.');
        }
      }

      if (apiResolution.config) {
        const workspace = (coworkConfig.workingDirectory || '').trim();
        const existingConfig = parseHermesConfigText(readText(this.engineManager.getConfigPath()));
        const nextConfig = mergeHermesConfigForWesightModel(existingConfig, apiResolution.config, {
          providerName: apiResolution.providerMetadata?.providerName,
          workingDirectory: workspace ? path.resolve(workspace) : undefined,
        });
        const yaml = serializeHermesConfig(nextConfig);
        changedConfig = writeIfChanged(this.engineManager.getConfigPath(), yaml);
        nextEnvText = mergeHermesManagedDotenvBlock(
          nextEnvText,
          HERMES_WESIGHT_MODEL_ENV_BLOCK,
          buildHermesEnvForWesightModel(apiResolution.config),
        );
      }

      const feishuResult = this.buildFeishuEnv(coworkConfig);
      if (feishuResult.error) {
        throw new Error(feishuResult.error);
      }
      nextEnvText = mergeHermesManagedDotenvBlock(
        nextEnvText,
        HERMES_WESIGHT_FEISHU_ENV_BLOCK,
        feishuResult.env,
      );
      const envChanged = writeIfChanged(this.engineManager.getEnvPath(), nextEnvText, 0o600);
      const env = parseHermesDotenvText(nextEnvText);
      this.engineManager.setSecretEnvVars(env);

      return {
        success: true,
        changed: changedConfig || envChanged,
      };
    } catch (error) {
      return {
        success: false,
        changed: false,
        status: this.engineManager.getStatus(),
        error: error instanceof Error ? error.message : 'Failed to sync Hermes Agent config.',
      };
    }
  }

  private buildFeishuEnv(coworkConfig: CoworkConfig): { env: Record<string, string>; error?: string } {
    if (this.getFeishuRuntimeOwnership() === FeishuRuntimeOwnership.LocalRuntime) {
      return buildHermesFeishuEnvForInstances(this.getFeishuInstances());
    }
    if (coworkConfig.agentEngine !== CoworkAgentEngine.Hermes) {
      return { env: {} };
    }
    return buildHermesFeishuEnvForInstances(this.getFeishuInstances());
  }
}
