import { afterEach, describe, expect, test, vi } from 'vitest';

import { ProviderName } from '../../shared/providers';
import { resolveCodexWesightApiConfig, resolveCurrentApiConfig, setStoreGetter } from './claudeSettings';
import * as coworkOpenAICompatProxy from './coworkOpenAICompatProxy';

describe('resolveCurrentApiConfig', () => {
  afterEach(() => {
    setStoreGetter(() => null);
    vi.restoreAllMocks();
  });

  test('uses the Zhipu Anthropic coding endpoint directly when Anthropic format is selected', () => {
    const configureProxy = vi.spyOn(coworkOpenAICompatProxy, 'configureCoworkOpenAICompatProxy');
    setStoreGetter(() => ({
      get: (key: string) => {
        if (key !== 'app_config') return null;
        return {
          model: {
            defaultModel: 'glm-5.1',
            defaultModelProvider: ProviderName.Zhipu,
          },
          providers: {
            [ProviderName.Zhipu]: {
              enabled: true,
              apiKey: 'sk-test-zhipu',
              baseUrl: 'https://open.bigmodel.cn/api/anthropic',
              apiFormat: 'anthropic',
              codingPlanEnabled: true,
              models: [{ id: 'glm-5.1', name: 'GLM 5.1' }],
            },
          },
        };
      },
    }) as never);

    const resolution = resolveCurrentApiConfig('local');

    expect(resolution.error).toBeUndefined();
    expect(resolution.config).toEqual({
      apiKey: 'sk-test-zhipu',
      baseURL: 'https://open.bigmodel.cn/api/anthropic',
      model: 'glm-5.1',
      apiType: 'anthropic',
    });
    expect(configureProxy).not.toHaveBeenCalled();
  });
});

describe('resolveCodexWesightApiConfig', () => {
  afterEach(() => {
    setStoreGetter(() => null);
    vi.restoreAllMocks();
  });

  test('routes an Anthropic-compatible DeepSeek config through the OpenAI-compatible endpoint', () => {
    const configureProxy = vi.spyOn(coworkOpenAICompatProxy, 'configureCoworkOpenAICompatProxy');
    vi.spyOn(coworkOpenAICompatProxy, 'getCoworkOpenAICompatProxyStatus').mockReturnValue({
      running: true,
      baseURL: 'http://127.0.0.1:12345/v1',
      hasUpstream: false,
      upstreamBaseURL: null,
      upstreamModel: null,
      lastError: null,
    });
    vi.spyOn(coworkOpenAICompatProxy, 'getCoworkOpenAICompatProxyBaseURL').mockReturnValue('http://127.0.0.1:12345/v1');
    setStoreGetter(() => ({
      get: (key: string) => {
        if (key !== 'app_config') return null;
        return {
          model: {
            defaultModel: 'deepseek-reasoner',
            defaultModelProvider: ProviderName.DeepSeek,
          },
          providers: {
            [ProviderName.DeepSeek]: {
              enabled: true,
              apiKey: 'sk-test-deepseek',
              baseUrl: 'https://api.deepseek.com/anthropic',
              apiFormat: 'anthropic',
              models: [{ id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' }],
            },
          },
        };
      },
    }) as never);

    const resolution = resolveCodexWesightApiConfig('local');

    expect(resolution.error).toBeUndefined();
    expect(resolution.config).toEqual({
      apiKey: 'sk-test-deepseek',
      baseURL: 'http://127.0.0.1:12345/v1',
      model: 'deepseek-reasoner',
      apiType: 'openai',
    });
    expect(configureProxy).toHaveBeenCalledWith({
      baseURL: 'https://api.deepseek.com',
      apiKey: 'sk-test-deepseek',
      model: 'deepseek-reasoner',
      provider: ProviderName.DeepSeek,
    });
  });

  test('uses the OpenAI-compatible coding plan endpoint for Codex', () => {
    const configureProxy = vi.spyOn(coworkOpenAICompatProxy, 'configureCoworkOpenAICompatProxy');
    vi.spyOn(coworkOpenAICompatProxy, 'getCoworkOpenAICompatProxyStatus').mockReturnValue({
      running: true,
      baseURL: 'http://127.0.0.1:23456/v1',
      hasUpstream: false,
      upstreamBaseURL: null,
      upstreamModel: null,
      lastError: null,
    });
    vi.spyOn(coworkOpenAICompatProxy, 'getCoworkOpenAICompatProxyBaseURL').mockReturnValue('http://127.0.0.1:23456/v1');
    setStoreGetter(() => ({
      get: (key: string) => {
        if (key !== 'app_config') return null;
        return {
          model: {
            defaultModel: 'glm-5',
            defaultModelProvider: ProviderName.Zhipu,
          },
          providers: {
            [ProviderName.Zhipu]: {
              enabled: true,
              apiKey: 'sk-test-zhipu',
              baseUrl: 'https://open.bigmodel.cn/api/anthropic',
              apiFormat: 'anthropic',
              codingPlanEnabled: true,
              models: [{ id: 'glm-5', name: 'GLM 5' }],
            },
          },
        };
      },
    }) as never);

    const resolution = resolveCodexWesightApiConfig('local');

    expect(resolution.error).toBeUndefined();
    expect(resolution.config?.baseURL).toBe('http://127.0.0.1:23456/v1');
    expect(configureProxy).toHaveBeenCalledWith({
      baseURL: 'https://open.bigmodel.cn/api/coding/paas/v4',
      apiKey: 'sk-test-zhipu',
      model: 'glm-5',
      provider: ProviderName.Zhipu,
    });
  });

  test('fails clearly when the provider has no OpenAI-compatible endpoint for Codex', () => {
    const configureProxy = vi.spyOn(coworkOpenAICompatProxy, 'configureCoworkOpenAICompatProxy');
    setStoreGetter(() => ({
      get: (key: string) => {
        if (key !== 'app_config') return null;
        return {
          model: {
            defaultModel: 'claude-sonnet-4-5-20250929',
            defaultModelProvider: ProviderName.Anthropic,
          },
          providers: {
            [ProviderName.Anthropic]: {
              enabled: true,
              apiKey: 'sk-test-anthropic',
              baseUrl: 'https://api.anthropic.com',
              apiFormat: 'anthropic',
              models: [{ id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5' }],
            },
          },
        };
      },
    }) as never);

    const resolution = resolveCodexWesightApiConfig('local');

    expect(resolution.config).toBeNull();
    expect(resolution.error).toBe('Provider anthropic does not have an OpenAI-compatible endpoint for Codex CLI.');
    expect(configureProxy).not.toHaveBeenCalled();
  });
});
