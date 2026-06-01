import os from 'os';
import path from 'path';

import {
  type CoworkImportedMessageInput,
  type CoworkMessageMetadata,
  type CoworkMessageType,
  type CoworkSessionStatus,
  type CoworkStore,
} from '../coworkStore';
import { buildCodexAppSessionId, encodeCodexAppThreadId } from './codexAppIds';
import type { CodexAppServerClient } from './codexAppServerClient';

export interface CodexAppTaskSyncOptions {
  cwd?: string;
  includeAll?: boolean;
  limit?: number;
}

export interface CodexAppTaskSyncResult {
  synced: number;
  imported: number;
  updated: number;
  lastSyncAt: number;
}

export interface CodexAppThreadOpenResult {
  sessionId: string;
  threadId: string;
  messagesChanged: boolean;
}

interface CodexThread {
  id: string;
  preview?: string;
  name?: string | null;
  modelProvider?: string;
  createdAt?: number;
  updatedAt?: number;
  cwd?: string;
  status?: unknown;
  turns?: CodexTurn[];
}

interface CodexTurn {
  id: string;
  items?: CodexThreadItem[];
  status?: string;
  error?: unknown;
  startedAt?: number | null;
  completedAt?: number | null;
  durationMs?: number | null;
}

type CodexThreadItem = Record<string, unknown> & { type?: string; id?: string };

const JsonRpcMethod = {
  ThreadList: 'thread/list',
  ThreadRead: 'thread/read',
} as const;

const DEFAULT_SYNC_LIMIT = 50;
const MAX_SYNC_LIMIT = 100;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

const firstString = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
};

const normalizeTimestamp = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return numeric < 10_000_000_000 ? Math.round(numeric * 1000) : Math.round(numeric);
};

const normalizeLimit = (value: unknown): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_SYNC_LIMIT;
  return Math.max(1, Math.min(MAX_SYNC_LIMIT, Math.floor(numeric)));
};

const stringifyPayload = (value: unknown): string => {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const summarizeUserContent = (content: unknown): string => {
  if (!Array.isArray(content)) return '';
  return content
    .map((item) => {
      if (!isRecord(item)) return '';
      if (item.type === 'text') return firstString(item.text) ?? '';
      if (item.type === 'localImage') return `[Image: ${firstString(item.path) ?? ''}]`;
      if (item.type === 'image') return `[Image: ${firstString(item.url) ?? ''}]`;
      if (item.type === 'skill') return `[Skill: ${firstString(item.name) ?? ''}]`;
      if (item.type === 'mention') return `[File: ${firstString(item.path, item.name) ?? ''}]`;
      return '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
};

const statusFromThread = (thread: CodexThread): CoworkSessionStatus => {
  const status = isRecord(thread.status) ? thread.status.type : thread.status;
  if (status === 'active') return 'running';
  if (status === 'systemError') return 'error';
  return 'completed';
};

const titleFromThread = (thread: CodexThread): string => {
  const title = firstString(thread.name, thread.preview);
  if (title) return title.split(/\r?\n/)[0].slice(0, 80);
  return `Codex App ${thread.id.slice(0, 8)}`;
};

const cwdFromThread = (thread: CodexThread): string => {
  const cwd = firstString(thread.cwd);
  return cwd ? path.resolve(cwd) : os.homedir();
};

const buildToolMessage = (
  id: string,
  type: CoworkMessageType,
  content: string,
  timestamp: number,
  metadata: CoworkMessageMetadata,
): CoworkImportedMessageInput => ({
  id,
  type,
  content,
  metadata,
  timestamp,
});

export class CodexAppTaskSync {
  private readonly store: CoworkStore;
  private readonly client: CodexAppServerClient;

  constructor(deps: { store: CoworkStore; client: CodexAppServerClient }) {
    this.store = deps.store;
    this.client = deps.client;
  }

  async syncThreads(options: CodexAppTaskSyncOptions = {}): Promise<CodexAppTaskSyncResult> {
    const cwd = options.cwd?.trim() ? path.resolve(options.cwd) : undefined;
    await this.client.ensureConnected(cwd);
    const response = await this.client.sendRequest(JsonRpcMethod.ThreadList, {
      limit: normalizeLimit(options.limit),
      sortKey: 'updated_at',
      sortDirection: 'desc',
      archived: false,
      cwd: options.includeAll ? null : cwd,
      useStateDbOnly: false,
    }, 60_000);

    const threads = this.extractThreads(response);
    let imported = 0;
    let updated = 0;
    for (const thread of threads) {
      const changed = this.upsertThreadSession(thread);
      if (!changed) continue;
      const existingSessionId = this.store.findSessionIdByCodexAppThreadId(thread.id);
      if (existingSessionId === buildCodexAppSessionId(thread.id)) {
        imported += 1;
      } else {
        updated += 1;
      }
    }
    this.client.markSynced();
    return {
      synced: threads.length,
      imported,
      updated,
      lastSyncAt: Date.now(),
    };
  }

  async openThread(threadId: string): Promise<CodexAppThreadOpenResult> {
    const normalizedThreadId = threadId.trim();
    if (!normalizedThreadId) {
      throw new Error('Codex App thread id is required.');
    }
    await this.client.ensureConnected();
    const response = await this.client.sendRequest(JsonRpcMethod.ThreadRead, {
      threadId: normalizedThreadId,
      includeTurns: true,
    }, 60_000);
    const thread = this.extractThread(response);
    if (!thread) {
      throw new Error('Codex App did not return the requested thread.');
    }
    this.upsertThreadSession(thread);
    const sessionId = this.store.findSessionIdByCodexAppThreadId(thread.id) || buildCodexAppSessionId(thread.id);
    const messages = this.mapThreadMessages(thread);
    const messagesChanged = this.store.replaceImportedSessionMessages(sessionId, messages);
    this.client.markSynced();
    return { sessionId, threadId: thread.id, messagesChanged };
  }

  upsertThreadSession(thread: CodexThread): boolean {
    const existingSessionId = this.store.findSessionIdByCodexAppThreadId(thread.id);
    const sessionId = existingSessionId || buildCodexAppSessionId(thread.id);
    const createdAt = normalizeTimestamp(thread.createdAt, Date.now());
    const updatedAt = normalizeTimestamp(thread.updatedAt, createdAt);
    return this.store.upsertImportedSession({
      id: sessionId,
      title: titleFromThread(thread),
      claudeSessionId: encodeCodexAppThreadId(thread.id),
      codexAppThreadId: thread.id,
      status: statusFromThread(thread),
      cwd: cwdFromThread(thread),
      systemPrompt: '',
      executionMode: 'local',
      activeSkillIds: [],
      agentId: 'main',
      createdAt,
      updatedAt,
    });
  }

  mapThreadMessages(thread: CodexThread): CoworkImportedMessageInput[] {
    const messages: CoworkImportedMessageInput[] = [];
    for (const turn of thread.turns || []) {
      const startedAt = normalizeTimestamp(turn.startedAt, normalizeTimestamp(thread.updatedAt, Date.now()));
      const completedAt = normalizeTimestamp(turn.completedAt, startedAt);
      let sequence = 0;
      const nextTimestamp = (): number => startedAt + sequence++;
      for (const item of turn.items || []) {
        const itemId = firstString(item.id) ?? `item-${sequence}`;
        const baseId = `codex-app-${thread.id}-${turn.id}-${itemId}`;
        switch (item.type) {
          case 'userMessage': {
            const content = summarizeUserContent(item.content);
            if (!content) break;
            messages.push({
              id: `${baseId}-user`,
              type: 'user',
              content,
              metadata: { source: 'codex_app', codexAppThreadId: thread.id, codexTurnId: turn.id },
              timestamp: nextTimestamp(),
            });
            break;
          }
          case 'agentMessage': {
            const text = firstString(item.text);
            if (!text) break;
            messages.push({
              id: `${baseId}-assistant`,
              type: 'assistant',
              content: text,
              metadata: {
                source: 'codex_app',
                codexAppThreadId: thread.id,
                codexTurnId: turn.id,
                phase: firstString(item.phase),
                isStreaming: false,
                isFinal: true,
              },
              timestamp: nextTimestamp(),
            });
            break;
          }
          case 'commandExecution': {
            const command = firstString(item.command) ?? 'command';
            messages.push(buildToolMessage(
              `${baseId}-tool-use`,
              'tool_use',
              `Using tool: ${command}`,
              nextTimestamp(),
              {
                toolName: 'Bash',
                toolInput: {
                  command,
                  cwd: firstString(item.cwd),
                  source: 'codex_app',
                  status: firstString(item.status),
                },
                toolUseId: itemId,
                source: 'codex_app',
              },
            ));
            const output = firstString(item.aggregatedOutput);
            if (output) {
              messages.push(buildToolMessage(
                `${baseId}-tool-result`,
                'tool_result',
                output,
                nextTimestamp(),
                {
                  toolName: 'Bash',
                  toolResult: output,
                  isError: item.status === 'failed',
                  durationMs: Number(item.durationMs) || null,
                  source: 'codex_app',
                },
              ));
            }
            break;
          }
          case 'fileChange': {
            const changes = Array.isArray(item.changes) ? item.changes : [];
            const content = changes.length > 0
              ? changes
                .map(change => isRecord(change)
                  ? `${firstString(change.path) ?? 'file'}\n${firstString(change.diff) ?? ''}`
                  : stringifyPayload(change))
                .join('\n\n')
              : stringifyPayload(item);
            messages.push(buildToolMessage(
              `${baseId}-file-change`,
              'tool_use',
              content,
              nextTimestamp(),
              {
                toolName: 'FileChange',
                toolInput: { changes, source: 'codex_app', status: firstString(item.status) },
                toolUseId: itemId,
                source: 'codex_app',
              },
            ));
            break;
          }
          case 'mcpToolCall':
          case 'dynamicToolCall': {
            const toolName = firstString(item.tool, item.name, item.server, item.namespace) ?? 'Tool';
            const payload = stringifyPayload(item.result ?? item.contentItems ?? item.error ?? item.arguments ?? item);
            messages.push(buildToolMessage(
              `${baseId}-generic-tool`,
              item.result || item.error || item.contentItems ? 'tool_result' : 'tool_use',
              payload,
              nextTimestamp(),
              {
                toolName,
                toolInput: isRecord(item.arguments) ? item.arguments : item,
                toolResult: payload,
                isError: Boolean(item.error),
                source: 'codex_app',
              },
            ));
            break;
          }
          case 'imageGeneration': {
            const savedPath = firstString(item.savedPath, item.path, item.result);
            if (!savedPath) break;
            messages.push({
              id: `${baseId}-image`,
              type: 'assistant',
              content: 'Codex App generated an image.',
              metadata: {
                isStreaming: false,
                isFinal: true,
                source: 'codex_app',
                generatedImages: [{
                  path: savedPath,
                  name: path.basename(savedPath),
                  mimeType: 'image/png',
                  source: 'codex_app',
                }],
              },
              timestamp: nextTimestamp(),
            });
            break;
          }
          case 'plan':
          case 'reasoning':
            break;
          default:
            break;
        }
      }
      if (turn.status === 'failed' && turn.error) {
        messages.push({
          id: `codex-app-${thread.id}-${turn.id}-error`,
          type: 'system',
          content: stringifyPayload(turn.error),
          metadata: { source: 'codex_app', codexAppThreadId: thread.id, codexTurnId: turn.id },
          timestamp: completedAt,
        });
      }
    }
    return messages;
  }

  private extractThreads(response: unknown): CodexThread[] {
    if (!isRecord(response) || !Array.isArray(response.data)) return [];
    return response.data.filter((thread): thread is CodexThread => (
      isRecord(thread) && typeof thread.id === 'string'
    ));
  }

  private extractThread(response: unknown): CodexThread | null {
    if (!isRecord(response)) return null;
    const thread = isRecord(response.thread) ? response.thread : response;
    return typeof thread.id === 'string' ? thread as unknown as CodexThread : null;
  }
}
