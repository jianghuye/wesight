export const FeishuManagementMode = {
  LocalOpenClaw: 'local_openclaw',
  WesightManaged: 'wesight_managed',
} as const;

export type FeishuManagementModeType = typeof FeishuManagementMode[keyof typeof FeishuManagementMode];

export const FeishuRuntimeOwnership = {
  WesightManaged: 'wesight_managed',
  LocalRuntime: 'local_runtime',
} as const;

export type FeishuRuntimeOwnershipType = typeof FeishuRuntimeOwnership[keyof typeof FeishuRuntimeOwnership];

export const FeishuImportSource = {
  OpenClawLocal: 'openclaw_local',
} as const;

export type FeishuImportSourceType = typeof FeishuImportSource[keyof typeof FeishuImportSource];

export const FeishuSecretStatus = {
  Resolved: 'resolved',
  NeedsInput: 'needs_input',
} as const;

export type FeishuSecretStatusType = typeof FeishuSecretStatus[keyof typeof FeishuSecretStatus];

export const FeishuEngineKey = {
  OpenClaw: 'openclaw',
  Hermes: 'hermes',
  ClaudeCode: 'claude_code',
  Codex: 'codex',
} as const;

export type FeishuEngineKeyType = typeof FeishuEngineKey[keyof typeof FeishuEngineKey];

export const FEISHU_ENGINE_KEYS = [
  FeishuEngineKey.OpenClaw,
  FeishuEngineKey.Hermes,
  FeishuEngineKey.ClaudeCode,
  FeishuEngineKey.Codex,
] as const;

export const ImIpcChannel = {
  FeishuDetectOpenClawLocal: 'im:feishu:detect-openclaw-local',
  FeishuImportOpenClawLocal: 'im:feishu:import-openclaw-local',
  FeishuSetManagementMode: 'im:feishu:set-management-mode',
  FeishuSetRuntimeOwnership: 'im:feishu:set-runtime-ownership',
  FeishuRefreshRuntimeOwnership: 'im:feishu:refresh-runtime-ownership',
} as const;

export type ImIpcChannelType = typeof ImIpcChannel[keyof typeof ImIpcChannel];

export const isFeishuManagementMode = (value: unknown): value is FeishuManagementModeType => (
  value === FeishuManagementMode.LocalOpenClaw
  || value === FeishuManagementMode.WesightManaged
);

export const isFeishuRuntimeOwnership = (value: unknown): value is FeishuRuntimeOwnershipType => (
  value === FeishuRuntimeOwnership.WesightManaged
  || value === FeishuRuntimeOwnership.LocalRuntime
);

export const isFeishuEngineKey = (value: unknown): value is FeishuEngineKeyType => (
  value === FeishuEngineKey.OpenClaw
  || value === FeishuEngineKey.Hermes
  || value === FeishuEngineKey.ClaudeCode
  || value === FeishuEngineKey.Codex
);
