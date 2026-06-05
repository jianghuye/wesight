import { afterEach, describe, expect, test, vi } from 'vitest';

import { ProviderName } from '../../shared/providers';
import { resolveCurrentApiConfig, setStoreGetter } from './claudeSettings';
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
