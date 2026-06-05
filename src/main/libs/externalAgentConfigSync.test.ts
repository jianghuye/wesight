import { expect, test } from 'vitest';

import { buildEnvForConfig } from './claudeSettings';
import {
  mergeClaudeSettingsForWesightModel,
  mergeCodexConfigForLocalCli,
  mergeCodexConfigForWesightModel,
} from './externalAgentConfigSync';

const apiConfig = {
  apiKey: 'sk-wesight-secret',
  baseURL: 'https://api.example.com/v1',
  model: 'glm-5.1-highspeed',
  apiType: 'openai' as const,
};

test('mergeCodexConfigForWesightModel preserves user TOML content', () => {
  const existing = [
    '# user comment',
    '[features]',
    'web_search_request = true',
    '',
    '[model_providers.local]',
    'name = "local"',
    'base_url = "https://local.example/v1"',
    '',
  ].join('\n');

  const merged = mergeCodexConfigForWesightModel(
    existing,
    'Zhipu GLM',
    apiConfig.baseURL,
    apiConfig.model,
  );

  expect(merged).toContain('# user comment');
  expect(merged).toContain('[features]');
  expect(merged).toContain('web_search_request = true');
  expect(merged).toContain('[model_providers.local]');
  expect(merged).toContain('model_provider = "zhipu_glm"');
  expect(merged).toContain('model = "glm-5.1-highspeed"');
  expect(merged).toContain('[model_providers.zhipu_glm]');
  expect(merged).toContain('base_url = "https://api.example.com/v1"');
  expect(merged).not.toContain('sk-wesight-secret');
});

test('mergeCodexConfigForWesightModel is idempotent and removes duplicate managed entries', () => {
  const existing = [
    '# user comment',
    'model_provider = "old"',
    'model = "old-model"',
    'model_provider = "duplicate-old"',
    'model = "duplicate-model"',
    'model_reasoning_effort = "low"',
    'disable_response_storage = false',
    'disable_response_storage = false',
    '',
    '[features]',
    'web_search_request = true',
    '',
    '[model_providers.zhipu_glm]',
    'name = "old"',
    'base_url = "https://old.example/v1"',
    '',
    '[model_providers.local]',
    'name = "local"',
    'base_url = "https://local.example/v1"',
    '',
    '[model_providers.zhipu_glm]',
    'name = "duplicate-old"',
    'base_url = "https://duplicate.example/v1"',
    '',
  ].join('\n');

  const merged = mergeCodexConfigForWesightModel(
    existing,
    'Zhipu GLM',
    apiConfig.baseURL,
    apiConfig.model,
  );
  const mergedAgain = mergeCodexConfigForWesightModel(
    merged,
    'Zhipu GLM',
    apiConfig.baseURL,
    apiConfig.model,
  );

  expect(mergedAgain).toBe(merged);
  expect(merged.match(/^model_provider\s*=/gm)).toHaveLength(1);
  expect(merged.match(/^model\s*=/gm)).toHaveLength(1);
  expect(merged.match(/^model_reasoning_effort\s*=/gm)).toHaveLength(1);
  expect(merged.match(/^disable_response_storage\s*=/gm)).toHaveLength(1);
  expect(merged.match(/^\[model_providers\.zhipu_glm\]/gm)).toHaveLength(1);
  expect(merged).toContain('[model_providers.local]');
  expect(merged).toContain('[features]');
  expect(merged).toContain('web_search_request = true');
});

test('mergeCodexConfigForLocalCli switches back to local_codex when available', () => {
  const existing = [
    '# user comment',
    'model_provider = "minimax"',
    'model = "MiniMax-M2"',
    '',
    '[model_providers.local_codex]',
    'name = "Local Codex"',
    'wire_api = "responses"',
    'requires_openai_auth = true',
    '',
    '[model_providers.minimax]',
    'name = "minimax"',
    'base_url = "https://api.minimaxi.com/v1"',
    'wire_api = "responses"',
    'requires_openai_auth = true',
    '',
  ].join('\n');

  const merged = mergeCodexConfigForLocalCli(existing);

  expect(merged).toContain('# user comment');
  expect(merged).toContain('model_provider = "local_codex"');
  expect(merged).toContain('model = "MiniMax-M2"');
  expect(merged).toContain('[model_providers.local_codex]');
  expect(merged).toContain('[model_providers.minimax]');
});

test('mergeCodexConfigForLocalCli leaves config unchanged when local_codex is missing', () => {
  const existing = [
    'model_provider = "minimax"',
    '',
    '[model_providers.minimax]',
    'name = "minimax"',
    '',
  ].join('\n');

  expect(mergeCodexConfigForLocalCli(existing)).toBe(existing);
});

test('mergeClaudeSettingsForWesightModel overwrites stale Claude Code model config', () => {
  const merged = mergeClaudeSettingsForWesightModel({
    env: {
      ANTHROPIC_API_KEY: 'sk-minimax-secret',
      ANTHROPIC_AUTH_TOKEN: 'sk-minimax-secret',
      ANTHROPIC_BASE_URL: 'https://api.minimaxi.com/anthropic',
      ANTHROPIC_MODEL: 'MiniMax-M3.0',
      FOO_TOKEN: 'keep-me',
    },
    theme: 'dark',
  }, apiConfig);

  expect(merged.theme).toBe('dark');
  const env = merged.env as Record<string, unknown>;
  expect(env.ANTHROPIC_API_KEY).toBe(apiConfig.apiKey);
  expect(env.ANTHROPIC_AUTH_TOKEN).toBe(apiConfig.apiKey);
  expect(env.FOO_TOKEN).toBe('keep-me');
  expect(env.ANTHROPIC_BASE_URL).toBe(apiConfig.baseURL);
  expect(env.ANTHROPIC_MODEL).toBe(apiConfig.model);
  expect(JSON.stringify(merged)).not.toContain('${WESIGHT_APIKEY_ACTIVE_PROVIDER}');
});

test('mergeClaudeSettingsForWesightModel replaces old WeSight placeholders with real credentials', () => {
  const merged = mergeClaudeSettingsForWesightModel({
    env: {
      ANTHROPIC_API_KEY: '${WESIGHT_APIKEY_ACTIVE_PROVIDER}',
      ANTHROPIC_AUTH_TOKEN: '${WESIGHT_APIKEY_ACTIVE_PROVIDER}',
    },
    hooks: {
      Stop: [],
    },
  }, apiConfig);

  const env = merged.env as Record<string, unknown>;
  expect(env.ANTHROPIC_API_KEY).toBe(apiConfig.apiKey);
  expect(env.ANTHROPIC_AUTH_TOKEN).toBe(apiConfig.apiKey);
  expect(merged.hooks).toEqual({ Stop: [] });
  expect(JSON.stringify(merged)).not.toContain('${WESIGHT_APIKEY_ACTIVE_PROVIDER}');
  expect(JSON.stringify(merged)).toContain(apiConfig.apiKey);
});

test('mergeClaudeSettingsForWesightModel records all managed Claude env keys', () => {
  const merged = mergeClaudeSettingsForWesightModel({}, apiConfig);
  const managed = (merged.__wesight_managed as Record<string, unknown>).claudeCode as Record<string, unknown>;

  expect(managed.envKeys).toEqual([
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_BASE_URL',
    'ANTHROPIC_MODEL',
    'ANTHROPIC_REASONING_MODEL',
    'ANTHROPIC_DEFAULT_SONNET_MODEL',
    'ANTHROPIC_DEFAULT_OPUS_MODEL',
    'ANTHROPIC_DEFAULT_HAIKU_MODEL',
    'ANTHROPIC_SMALL_FAST_MODEL',
  ]);
});

test('buildEnvForConfig injects real secrets only into process env', () => {
  const env = buildEnvForConfig(apiConfig);

  expect(env.WESIGHT_APIKEY_ACTIVE_PROVIDER).toBe(apiConfig.apiKey);
  expect(env.ANTHROPIC_API_KEY).toBe(apiConfig.apiKey);
  expect(env.OPENAI_API_KEY).toBe(apiConfig.apiKey);
  expect(env.OPENAI_BASE_URL).toBe(apiConfig.baseURL);
  expect(env.OPENAI_MODEL).toBe(apiConfig.model);
});
