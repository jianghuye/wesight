import { randomUUID } from 'crypto';

import {
  type CoworkAgentEngine,
  RuntimeCallSource,
  type RuntimeCallSource as RuntimeCallSourceType,
  RuntimeCallStatus,
} from '../../shared/cowork/constants';
import type { RuntimeToolMetric } from '../../shared/cowork/runtimeMetrics';
import { estimateTextTokensForRuntimeMetrics } from '../../shared/cowork/runtimeMetrics';
import type {
  CoworkMessage,
  CoworkStore,
} from '../coworkStore';
import type {
  RuntimeCallCreateInput,
  RuntimeTelemetryStore,
} from '../runtimeTelemetryStore';
import type {
  CoworkContinueOptions,
  CoworkRuntimeMetric,
  CoworkStartOptions,
} from './agentEngine/types';

export interface RuntimeModelSnapshot {
  providerKey: string | null;
  providerName: string | null;
  modelId: string | null;
  modelName: string | null;
  configSource: string | null;
}

type RuntimeTelemetryTrackerDeps = {
  store: CoworkStore;
  telemetryStore: RuntimeTelemetryStore;
  getModelSnapshot: (engine: CoworkAgentEngine) => RuntimeModelSnapshot;
};

type PendingTool = {
  toolName: string;
  toolUseId: string | null;
  startedAt: number;
};

type ActiveRuntimeCall = {
  callId: string;
  sessionId: string;
  engine: CoworkAgentEngine;
  startedAt: number;
  assistantContentByMessageId: Map<string, string>;
  toolCallCount: number;
  agentSteps: number;
  modelStepRecorded: boolean;
  pendingTools: PendingTool[];
  tools: RuntimeToolMetric[];
};

const getPromptContextText = (sessionMessages: CoworkMessage[], prompt: string): string => {
  const existing = sessionMessages.map((message) => message.content).join('\n');
  if (!prompt.trim()) return existing;
  return existing.includes(prompt) ? existing : `${existing}\n${prompt}`;
};

const safeString = (value: unknown): string | null => {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

const getMessageToolName = (message: CoworkMessage): string => {
  return safeString(message.metadata?.toolName) ?? 'Tool';
};

const getMessageToolUseId = (message: CoworkMessage): string | null => {
  return safeString(message.metadata?.toolUseId);
};

const normalizeRuntimeSource = (
  options: CoworkStartOptions | CoworkContinueOptions,
): RuntimeCallSourceType => {
  return options.runtimeSource ?? RuntimeCallSource.Chat;
};

const runtimeSnapshotToModelSnapshot = (
  options: CoworkStartOptions | CoworkContinueOptions,
): RuntimeModelSnapshot | null => {
  const snapshot = options.runtimeSnapshot;
  if (!snapshot) return null;
  return {
    providerKey: snapshot.providerKey,
    providerName: snapshot.providerName,
    modelId: snapshot.modelId,
    modelName: snapshot.modelName,
    configSource: snapshot.configSource,
  };
};

export class RuntimeTelemetryTracker {
  private readonly store: CoworkStore;
  private readonly telemetryStore: RuntimeTelemetryStore;
  private readonly getModelSnapshot: (engine: CoworkAgentEngine) => RuntimeModelSnapshot;
  private readonly activeCalls = new Map<string, ActiveRuntimeCall>();

  constructor(deps: RuntimeTelemetryTrackerDeps) {
    this.store = deps.store;
    this.telemetryStore = deps.telemetryStore;
    this.getModelSnapshot = deps.getModelSnapshot;
  }

  startTurn(
    sessionId: string,
    prompt: string,
    engine: CoworkAgentEngine,
    options: CoworkStartOptions | CoworkContinueOptions,
  ): void {
    const session = this.store.getSession(sessionId);
    const model = runtimeSnapshotToModelSnapshot(options) ?? this.getModelSnapshot(engine);
    const callId = randomUUID();
    const startedAt = Date.now();
    const contextText = getPromptContextText(session?.messages ?? [], prompt);
    const contextTokens = estimateTextTokensForRuntimeMetrics(contextText);
    const inputTokens = estimateTextTokensForRuntimeMetrics(prompt);
    const input: RuntimeCallCreateInput = {
      id: callId,
      sessionId,
      turnIndex: this.telemetryStore.getNextTurnIndex(sessionId),
      agentId: session?.agentId ?? null,
      source: normalizeRuntimeSource(options),
      engine,
      providerKey: model.providerKey,
      providerName: model.providerName,
      modelId: model.modelId,
      modelName: model.modelName,
      configSource: model.configSource,
      cwd: session?.cwd ?? null,
      startedAt,
      inputTokens,
      contextTokens,
      tokensEstimated: true,
      metadata: {
        promptChars: prompt.length,
        contextChars: contextText.length,
      },
    };
    this.telemetryStore.createCall(input);
    this.activeCalls.set(sessionId, {
      callId,
      sessionId,
      engine,
      startedAt,
      assistantContentByMessageId: new Map(),
      toolCallCount: 0,
      agentSteps: 0,
      modelStepRecorded: false,
      pendingTools: [],
      tools: [],
    });
  }

  recordMessage(sessionId: string, message: CoworkMessage): void {
    const active = this.activeCalls.get(sessionId);
    if (!active) return;
    if (message.type === 'assistant') {
      this.recordAssistantContent(active, message.id, message.content);
      return;
    }
    if (message.type === 'tool_use') {
      this.recordToolUse(active, message);
      return;
    }
    if (message.type === 'tool_result') {
      this.recordToolResult(active, message);
    }
  }

  recordMessageUpdate(sessionId: string, messageId: string, content: string): void {
    const active = this.activeCalls.get(sessionId);
    if (!active) return;
    this.recordAssistantContent(active, messageId, content);
  }

  recordRuntimeMetric(sessionId: string, metric: CoworkRuntimeMetric): void {
    const active = this.activeCalls.get(sessionId);
    if (!active) return;
    if (metric.type === 'usage') {
      this.telemetryStore.applyUsage(active.callId, {
        inputTokens: metric.inputTokens,
        outputTokens: metric.outputTokens,
        cacheReadTokens: metric.cacheReadTokens,
        cacheWriteTokens: metric.cacheWriteTokens,
        contextTokens: metric.contextTokens,
        tokensEstimated: metric.tokensEstimated,
      });
      return;
    }
    if (metric.type === 'step') {
      active.agentSteps += 1;
      this.flushToolStats(active);
    }
  }

  finishTurn(sessionId: string, status: RuntimeCallStatus, error?: string | null): void {
    const active = this.activeCalls.get(sessionId);
    if (!active) return;
    if (status === RuntimeCallStatus.Completed && active.agentSteps === 0) {
      this.recordModelStep(active);
    }
    this.flushToolStats(active);
    this.telemetryStore.finishCall(active.callId, status, Date.now(), error ?? null);
    this.activeCalls.delete(sessionId);
  }

  discardTurn(sessionId: string): void {
    this.activeCalls.delete(sessionId);
  }

  private recordAssistantContent(active: ActiveRuntimeCall, messageId: string, content: string): void {
    if (content.trim()) {
      this.telemetryStore.markAssistantOutput(active.callId, Date.now());
      this.recordModelStep(active);
    }
    active.assistantContentByMessageId.set(messageId, content);
    const outputChars = Array.from(active.assistantContentByMessageId.values())
      .reduce((sum, value) => sum + value.length, 0);
    this.telemetryStore.updateAssistantEstimate(active.callId, outputChars, estimateTextTokensForRuntimeMetrics(
      Array.from(active.assistantContentByMessageId.values()).join('\n'),
    ));
  }

  private recordModelStep(active: ActiveRuntimeCall): void {
    if (active.modelStepRecorded) return;
    active.modelStepRecorded = true;
    active.agentSteps += 1;
    this.flushToolStats(active);
  }

  private recordToolUse(active: ActiveRuntimeCall, message: CoworkMessage): void {
    active.toolCallCount += 1;
    active.agentSteps += 1;
    active.pendingTools.push({
      toolName: getMessageToolName(message),
      toolUseId: getMessageToolUseId(message),
      startedAt: Date.now(),
    });
    this.flushToolStats(active);
  }

  private recordToolResult(active: ActiveRuntimeCall, message: CoworkMessage): void {
    const toolUseId = getMessageToolUseId(message);
    const toolName = getMessageToolName(message);
    const pendingIndex = active.pendingTools.findIndex((tool) => (
      toolUseId
        ? tool.toolUseId === toolUseId
        : tool.toolName === toolName
    ));
    const completedAt = Date.now();
    if (pendingIndex >= 0) {
      const [pending] = active.pendingTools.splice(pendingIndex, 1);
      active.tools.push({
        toolName: pending.toolName,
        toolUseId: pending.toolUseId,
        startedAt: pending.startedAt,
        completedAt,
        durationMs: Math.max(0, completedAt - pending.startedAt),
        isError: Boolean(message.metadata?.isError),
      });
    }
    this.flushToolStats(active);
  }

  private flushToolStats(active: ActiveRuntimeCall): void {
    const completedTools = active.tools.filter((tool) => tool.durationMs !== null);
    const toolLatencyMs = completedTools.length > 0
      ? completedTools.reduce((sum, tool) => sum + (tool.durationMs ?? 0), 0)
      : null;
    const pendingTools: RuntimeToolMetric[] = active.pendingTools.map((tool) => ({
      toolName: tool.toolName,
      toolUseId: tool.toolUseId,
      startedAt: tool.startedAt,
      completedAt: null as number | null,
      durationMs: null as number | null,
    }));
    this.telemetryStore.updateToolStats(
      active.callId,
      active.toolCallCount,
      active.agentSteps,
      toolLatencyMs,
      [...active.tools, ...pendingTools],
    );
  }
}
