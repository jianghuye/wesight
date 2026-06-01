import type { CoworkAgentEngine } from './constants';

export interface CoworkSessionRuntimeSnapshot {
  agentEngine: CoworkAgentEngine;
  engineLabel: string;
  providerKey: string | null;
  providerName: string | null;
  modelId: string | null;
  modelName: string | null;
  modelLabel: string;
  configSource: string | null;
  capturedAt: number;
}
