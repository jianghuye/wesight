import yaml from 'js-yaml';

import type { FeishuInstanceConfig } from '../im/types';
import type { CoworkApiConfig } from './coworkConfigStore';

export interface HermesConfig {
  model?: {
    provider?: string;
    default?: string;
    base_url?: string;
    api_mode?: string;
    [key: string]: unknown;
  };
  terminal?: Record<string, unknown>;
  display?: Record<string, unknown>;
  compression?: Record<string, unknown>;
  api_server?: Record<string, unknown>;
  env?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface HermesModelProviderRecord {
  id: string;
  name: string;
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  config: HermesConfig;
  env: Record<string, string>;
  isCurrent: boolean;
}

export const DEFAULT_HERMES_PROVIDER = 'custom';
export const DEFAULT_HERMES_MODEL = 'default-model';
export const HERMES_WESIGHT_MODEL_ENV_BLOCK = 'wesight-model';
export const HERMES_WESIGHT_FEISHU_ENV_BLOCK = 'wesight-feishu';

const HermesProvider = {
  Anthropic: 'anthropic',
  Custom: 'custom',
  Zai: 'zai',
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
};

const getString = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : '';
};

const providerDisplayName = (value: string | undefined): string => {
  const normalized = value?.trim() || 'Hermes';
  const known: Record<string, string> = {
    anthropic: 'Anthropic',
    custom: 'Custom',
    deepseek: 'DeepSeek',
    gemini: 'Gemini',
    kimi: 'Kimi',
    moonshot: 'Moonshot',
    openai: 'OpenAI',
    qwen: 'Qwen',
    wesight: 'WeSight',
    zai: 'Z.AI / GLM',
    'z-ai': 'Z.AI / GLM',
  };
  return known[normalized.toLowerCase()]
    ?? normalized
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const getUrlHost = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    return new URL(trimmed).hostname.toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
};

const isZaiBaseUrl = (baseUrl: string): boolean => {
  const host = getUrlHost(baseUrl);
  return host === 'open.bigmodel.cn'
    || host.endsWith('.bigmodel.cn')
    || host === 'api.z.ai'
    || host.endsWith('.z.ai');
};

const providerKeyForConfig = (config: CoworkApiConfig, _providerName?: string): string => {
  if (isZaiBaseUrl(config.baseURL)) return HermesProvider.Zai;
  if (config.apiType === 'anthropic') return HermesProvider.Anthropic;
  return HermesProvider.Custom;
};

const apiModeForConfig = (config: CoworkApiConfig, provider: string, baseUrl: string): string | undefined => {
  if (config.apiType === 'anthropic') return 'anthropic_messages';
  if (provider === HermesProvider.Zai && baseUrl.toLowerCase().replace(/\/+$/, '').endsWith('/anthropic')) {
    return 'anthropic_messages';
  }
  return undefined;
};

const parseModel = (config: HermesConfig): { provider: string; model: string; baseUrl: string } => {
  const modelConfig = isRecord(config.model) ? config.model : {};
  return {
    provider: getString(modelConfig.provider) || DEFAULT_HERMES_PROVIDER,
    model: getString(modelConfig.default) || DEFAULT_HERMES_MODEL,
    baseUrl: getString(modelConfig.base_url),
  };
};

export const parseHermesConfig = (value: unknown): HermesConfig => {
  return isRecord(value) ? value as HermesConfig : {};
};

export const parseHermesConfigText = (text: string): HermesConfig => {
  try {
    return parseHermesConfig(yaml.load(text || '{}'));
  } catch {
    return {};
  }
};

export const serializeHermesConfig = (config: HermesConfig): string => {
  return yaml.dump(config, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });
};

export const parseHermesDotenvText = (text: string): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    const value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      try {
        env[key] = JSON.parse(value);
      } catch {
        env[key] = value.slice(1, -1);
      }
    } else {
      env[key] = value;
    }
  }
  return env;
};

export const buildHermesDotenv = (env: Record<string, string>): string => {
  return Object.entries(env)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join('\n') + '\n';
};

const managedDotenvStart = (blockId: string): string => `# >>> WeSight managed: ${blockId}`;
const managedDotenvEnd = (blockId: string): string => `# <<< WeSight managed: ${blockId}`;

export const mergeHermesManagedDotenvBlock = (
  text: string,
  blockId: string,
  env: Record<string, string>,
): string => {
  const start = managedDotenvStart(blockId);
  const end = managedDotenvEnd(blockId);
  const lines = text.split(/\r?\n/);
  const nextLines: string[] = [];
  let skipping = false;

  for (const line of lines) {
    if (line.trim() === start) {
      skipping = true;
      continue;
    }
    if (skipping) {
      if (line.trim() === end) {
        skipping = false;
      }
      continue;
    }
    nextLines.push(line);
  }

  while (nextLines.length > 0 && nextLines[nextLines.length - 1].trim() === '') {
    nextLines.pop();
  }

  const entries = Object.entries(env).filter(([key]) => key.trim());
  if (entries.length === 0) {
    return nextLines.length > 0 ? `${nextLines.join('\n')}\n` : '';
  }

  const block = [
    start,
    ...entries.map(([key, value]) => `${key}=${JSON.stringify(value ?? '')}`),
    end,
  ];

  if (nextLines.length > 0) {
    return `${nextLines.join('\n')}\n\n${block.join('\n')}\n`;
  }
  return `${block.join('\n')}\n`;
};

export interface HermesFeishuEnvBuildResult {
  env: Record<string, string>;
  error?: string;
  instanceId?: string;
}

export const buildHermesFeishuEnvForInstances = (
  instances: FeishuInstanceConfig[],
): HermesFeishuEnvBuildResult => {
  const enabledInstances = instances.filter((instance) => (
    instance.enabled
    && instance.appId.trim()
    && instance.appSecret.trim()
  ));

  if (enabledInstances.length === 0) {
    return { env: {} };
  }

  if (enabledInstances.length > 1) {
    return {
      env: {},
      error: 'Hermes Agent currently supports one enabled Feishu bot in WeSight. Disable the extra Feishu instances before starting Hermes.',
    };
  }

  const instance = enabledInstances[0];
  const dmOpen = instance.dmPolicy === 'open';
  const allowedUsers = instance.dmPolicy === 'open'
    ? ''
    : (instance.allowFrom || []).map((item) => item.trim()).filter(Boolean).join(',');

  return {
    instanceId: instance.instanceId,
    env: {
      FEISHU_APP_ID: instance.appId.trim(),
      FEISHU_APP_SECRET: instance.appSecret.trim(),
      FEISHU_DOMAIN: instance.domain === 'lark' ? 'lark' : 'feishu',
      FEISHU_CONNECTION_MODE: 'websocket',
      FEISHU_ALLOW_ALL_USERS: dmOpen ? 'true' : 'false',
      FEISHU_ALLOWED_USERS: allowedUsers,
      FEISHU_GROUP_POLICY: instance.groupPolicy || 'allowlist',
      FEISHU_REQUIRE_MENTION: 'true',
    },
  };
};

export const buildHermesEnvForWesightModel = (
  config: CoworkApiConfig | null,
): Record<string, string> => {
  if (!config) {
    return {
      HERMES_SKIP_SETUP: '1',
      HERMES_NO_SETUP: '1',
    };
  }

  const baseUrl = config.baseURL.trim().replace(/\/+$/, '');
  const provider = providerKeyForConfig(config);
  const common = {
    HERMES_SKIP_SETUP: '1',
    HERMES_NO_SETUP: '1',
    HERMES_INFERENCE_PROVIDER: provider,
    HERMES_INFERENCE_MODEL: config.model,
    HERMES_INFERENCE_BASE_URL: baseUrl,
    HERMES_INFERENCE_API_KEY: config.apiKey,
    HERMES_MODEL: config.model,
  };

  if (provider === HermesProvider.Zai) {
    return {
      ...common,
      GLM_API_KEY: config.apiKey,
      ZAI_API_KEY: config.apiKey,
      Z_AI_API_KEY: config.apiKey,
      GLM_BASE_URL: baseUrl,
    };
  }

  if (provider === HermesProvider.Anthropic) {
    return {
      ...common,
      ANTHROPIC_API_KEY: config.apiKey,
      ANTHROPIC_AUTH_TOKEN: config.apiKey,
      ANTHROPIC_BASE_URL: baseUrl,
    };
  }

  return {
    ...common,
    OPENAI_API_KEY: config.apiKey,
    OPENAI_BASE_URL: baseUrl,
  };
};

export const buildHermesRuntimeEnvForLocalCli = (
  config: HermesConfig,
  env: Record<string, string>,
): Record<string, string> => {
  const current = parseModel(config);
  if (!isZaiBaseUrl(current.baseUrl)) {
    return env;
  }

  const provider = current.provider.trim().toLowerCase();
  if (provider !== HermesProvider.Anthropic && provider !== HermesProvider.Zai) {
    return env;
  }

  const apiKey = env.GLM_API_KEY
    || env.ZAI_API_KEY
    || env.Z_AI_API_KEY
    || env.HERMES_INFERENCE_API_KEY
    || env.ANTHROPIC_AUTH_TOKEN
    || env.ANTHROPIC_API_KEY
    || '';
  if (!apiKey) {
    return env;
  }

  return {
    ...env,
    HERMES_INFERENCE_PROVIDER: HermesProvider.Zai,
    HERMES_INFERENCE_MODEL: current.model,
    HERMES_INFERENCE_BASE_URL: current.baseUrl,
    HERMES_INFERENCE_API_KEY: apiKey,
    GLM_API_KEY: apiKey,
    ZAI_API_KEY: apiKey,
    Z_AI_API_KEY: apiKey,
    GLM_BASE_URL: current.baseUrl,
  };
};

export const mergeHermesConfigForWesightModel = (
  existingConfig: HermesConfig,
  config: CoworkApiConfig,
  options: {
    providerName?: string;
    workingDirectory?: string;
  } = {},
): HermesConfig => {
  const provider = providerKeyForConfig(config, options.providerName);
  const model = config.model.trim() || DEFAULT_HERMES_MODEL;
  const baseUrl = config.baseURL.trim().replace(/\/+$/, '');
  const apiMode = apiModeForConfig(config, provider, baseUrl);
  const modelConfig: Record<string, unknown> = {
    ...(isRecord(existingConfig.model) ? existingConfig.model : {}),
    provider,
    default: model,
  };
  if (baseUrl) {
    modelConfig.base_url = baseUrl;
  } else {
    delete modelConfig.base_url;
  }
  if (apiMode) {
    modelConfig.api_mode = apiMode;
  } else {
    delete modelConfig.api_mode;
  }

  return {
    ...existingConfig,
    model: modelConfig,
    terminal: {
      ...(isRecord(existingConfig.terminal) ? existingConfig.terminal : {}),
      backend: 'local',
      ...(options.workingDirectory ? { cwd: options.workingDirectory } : {}),
      timeout: 3600,
      lifetime_seconds: 3600,
    },
    display: {
      ...(isRecord(existingConfig.display) ? existingConfig.display : {}),
      compact: true,
      tool_progress: 'all',
    },
    compression: {
      ...(isRecord(existingConfig.compression) ? existingConfig.compression : {}),
      enabled: true,
    },
    api_server: {
      ...(isRecord(existingConfig.api_server) ? existingConfig.api_server : {}),
      enabled: true,
      host: '127.0.0.1',
    },
  };
};

export const listHermesModelProviders = (
  config: HermesConfig,
  env: Record<string, string> = {},
): HermesModelProviderRecord[] => {
  const current = parseModel(config);
  const apiKey = env.HERMES_INFERENCE_API_KEY
    || env.ANTHROPIC_AUTH_TOKEN
    || env.ANTHROPIC_API_KEY
    || env.GLM_API_KEY
    || env.ZAI_API_KEY
    || env.Z_AI_API_KEY
    || env.OPENAI_API_KEY
    || '';
  const baseUrl = current.baseUrl
    || env.HERMES_INFERENCE_BASE_URL
    || env.ANTHROPIC_BASE_URL
    || env.GLM_BASE_URL
    || env.OPENAI_BASE_URL
    || '';
  return [
    {
      id: `hermes-${current.provider}-${current.model}`,
      name: providerDisplayName(current.provider),
      provider: current.provider,
      model: current.model,
      apiKey,
      baseUrl,
      config,
      env,
      isCurrent: true,
    },
  ];
};

export const settingsConfigFromHermesRecord = (
  record: HermesModelProviderRecord,
): Record<string, unknown> => {
  return {
    config: record.config,
    env: record.env,
    provider: record.provider,
    model: record.model,
  };
};

export const summarizeHermesSettingsConfig = (
  settingsConfig: Record<string, unknown>,
): { apiKey: string; baseUrl: string; model: string } => {
  const config = parseHermesConfig(settingsConfig.config);
  const env = isRecord(settingsConfig.env)
    ? Object.fromEntries(Object.entries(settingsConfig.env).map(([key, value]) => [key, getString(value)]))
    : {};
  const record = listHermesModelProviders(config, env)[0];
  return {
    apiKey: record?.apiKey ?? '',
    baseUrl: record?.baseUrl ?? '',
    model: getString(settingsConfig.model) || record?.model || DEFAULT_HERMES_MODEL,
  };
};
