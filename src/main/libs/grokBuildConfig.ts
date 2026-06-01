export const DEFAULT_GROK_BUILD_MODEL = 'grok-code-fast-1';

export interface GrokBuildParsedConfig {
  topLevel: Record<string, string>;
  models: Record<string, string>;
  modelTables: Record<string, Record<string, string>>;
}

export interface GrokBuildConfigSummary {
  providerId: string | null;
  providerName: string | null;
  model: string;
  count: number;
}

const unquoteTomlString = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed.split('#')[0]?.trim() ?? '';
};

const parseTomlKeyValue = (line: string): { key: string; value: string } | null => {
  const match = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*(.+?)\s*$/);
  if (!match) return null;
  return {
    key: match[1],
    value: unquoteTomlString(match[2]),
  };
};

const parseModelTableName = (section: string): string | null => {
  if (!section.startsWith('model.')) return null;
  return unquoteTomlString(section.slice('model.'.length));
};

export const parseGrokBuildConfigText = (text: string): GrokBuildParsedConfig => {
  const topLevel: Record<string, string> = {};
  const models: Record<string, string> = {};
  const modelTables: Record<string, Record<string, string>> = {};
  let section: string | null = null;

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      const modelName = parseModelTableName(section);
      if (modelName && !modelTables[modelName]) {
        modelTables[modelName] = {};
      }
      continue;
    }

    const entry = parseTomlKeyValue(trimmed);
    if (!entry) continue;
    const modelName = section ? parseModelTableName(section) : null;
    if (modelName) {
      modelTables[modelName] = {
        ...modelTables[modelName],
        [entry.key]: entry.value,
      };
    } else if (section === 'models') {
      models[entry.key] = entry.value;
    } else if (!section) {
      topLevel[entry.key] = entry.value;
    }
  }

  return { topLevel, models, modelTables };
};

export const summarizeGrokBuildConfig = (config: GrokBuildParsedConfig): GrokBuildConfigSummary => {
  const modelIds = Object.keys(config.modelTables).filter(Boolean);
  const model = config.models.default
    || config.topLevel.model
    || modelIds[0]
    || DEFAULT_GROK_BUILD_MODEL;
  const table = config.modelTables[model] ?? {};
  const count = new Set([model, ...modelIds].filter(Boolean)).size;

  return {
    providerId: model || null,
    providerName: table.name || table.model || model || null,
    model,
    count,
  };
};

export const mergeGrokBuildDefaultModel = (text: string, model: string): string => {
  const selectedModel = model.trim() || DEFAULT_GROK_BUILD_MODEL;
  const defaultLine = `default = ${JSON.stringify(selectedModel)}`;
  const lines = text.split(/\r?\n/);
  const nextLines: string[] = [];
  let foundModelsSection = false;
  let inModelsSection = false;
  let wroteDefault = false;

  for (const line of lines) {
    const sectionMatch = line.trim().match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      if (inModelsSection && !wroteDefault) {
        nextLines.push(defaultLine);
        wroteDefault = true;
      }
      inModelsSection = sectionMatch[1].trim() === 'models';
      foundModelsSection = foundModelsSection || inModelsSection;
    }

    if (inModelsSection && /^\s*default\s*=/.test(line)) {
      nextLines.push(defaultLine);
      wroteDefault = true;
      continue;
    }
    nextLines.push(line);
  }

  if (foundModelsSection && inModelsSection && !wroteDefault) {
    nextLines.push(defaultLine);
  }

  if (!foundModelsSection) {
    if (nextLines.some((line) => line.trim())) {
      nextLines.push('');
    }
    nextLines.push('[models]', defaultLine);
  }

  return `${nextLines.join('\n').replace(/\n+$/, '')}\n`;
};
