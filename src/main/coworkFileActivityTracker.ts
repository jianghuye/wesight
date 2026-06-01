import fs from 'fs';
import path from 'path';

import {
  type CoworkFileActivity,
  CoworkFileActivitySource,
  CoworkFileActivityStatus,
} from '../shared/cowork/fileActivity';
import type { CoworkMessage } from './coworkStore';

const MAX_FILE_SNAPSHOT_BYTES = 512 * 1024;
const MAX_TOOL_PREVIEW_CHARS = 120_000;
const READ_DEBOUNCE_MS = 120;
const DELETE_DEBOUNCE_MS = 450;
const MAX_ACTIVE_WATCHERS = 12;

const IGNORED_SEGMENTS = new Set([
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  'dist',
  'dist-electron',
  'build',
  '.next',
  '.vite',
  'coverage',
  'release',
  '.turbo',
  '.cache',
]);

const IGNORED_FILE_PATTERNS = [
  /^\.DS_Store$/i,
  /^\._/,
  /^\.#/,
  /~$/,
  /\.(tmp|temp|swp|swo|part|download|crdownload)$/i,
];

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  '.c': 'c',
  '.cc': 'cpp',
  '.cpp': 'cpp',
  '.cs': 'csharp',
  '.css': 'css',
  '.go': 'go',
  '.html': 'html',
  '.java': 'java',
  '.js': 'javascript',
  '.json': 'json',
  '.jsx': 'jsx',
  '.md': 'markdown',
  '.mjs': 'javascript',
  '.py': 'python',
  '.rs': 'rust',
  '.sh': 'bash',
  '.swift': 'swift',
  '.toml': 'toml',
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.vue': 'vue',
  '.xml': 'xml',
  '.yaml': 'yaml',
  '.yml': 'yaml',
};

interface TrackedSession {
  sessionId: string;
  root: string;
  watcher: fs.FSWatcher | null;
  pendingReads: Map<string, ReturnType<typeof setTimeout>>;
  pendingDeletes: Map<string, ReturnType<typeof setTimeout>>;
  knownSignatures: Map<string, string>;
  stopTimer: ReturnType<typeof setTimeout> | null;
}

const normalizeToolName = (value: unknown): string => (
  typeof value === 'string' ? value.toLowerCase().replace(/[\s_]+/g, '') : ''
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const getString = (input: Record<string, unknown> | undefined, keys: string[]): string | null => {
  if (!input) return null;
  for (const key of keys) {
    const value = input[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return null;
};

export const shouldIgnoreActivityPath = (root: string, filePath: string): boolean => {
  const relative = path.relative(root, filePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return true;
  }
  const parts = relative.split(path.sep).filter(Boolean);
  if (parts.some((part) => IGNORED_SEGMENTS.has(part))) return true;
  const fileName = parts[parts.length - 1] ?? '';
  return IGNORED_FILE_PATTERNS.some((pattern) => pattern.test(fileName));
};

const inferLanguage = (filePath: string): string | null => {
  const extension = path.extname(filePath).toLowerCase();
  return LANGUAGE_BY_EXTENSION[extension] ?? null;
};

const truncateToolPreviewContent = (content: string | null): { content: string | null; truncated: boolean } => {
  if (content === null) return { content: null, truncated: false };
  if (content.length <= MAX_TOOL_PREVIEW_CHARS) return { content, truncated: false };
  return {
    content: content.slice(0, MAX_TOOL_PREVIEW_CHARS),
    truncated: true,
  };
};

const isProbablyBinary = (buffer: Buffer): boolean => {
  if (buffer.includes(0)) return true;
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  if (sample.length === 0) return false;
  let suspicious = 0;
  for (const byte of sample) {
    if (byte < 7) suspicious += 1;
    if (byte > 13 && byte < 32) suspicious += 1;
  }
  return suspicious / sample.length > 0.08;
};

const resolveToolPath = (cwd: string, input: Record<string, unknown> | undefined): string | null => {
  const rawPath = getString(input, [
    'file_path',
    'path',
    'filePath',
    'target_file',
    'targetFile',
    'filename',
    'file',
  ]);
  if (!rawPath) return null;
  const resolved = path.isAbsolute(rawPath) ? path.resolve(rawPath) : path.resolve(cwd, rawPath);
  const root = path.resolve(cwd);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return resolved;
};

const collectEditPreview = (input: Record<string, unknown> | undefined): string | null => {
  const direct = getString(input, ['new_str', 'new_string', 'new_text', 'newStr', 'newText', 'replace']);
  if (direct !== null) return direct;
  const edits = input?.edits ?? input?.changes ?? input?.operations;
  if (!Array.isArray(edits)) return null;
  const parts = edits
    .filter(isRecord)
    .map((edit) => getString(edit, ['new_str', 'new_string', 'new_text', 'newStr', 'replace']))
    .filter((value): value is string => value !== null);
  return parts.length > 0 ? parts.join('\n\n...\n\n') : null;
};

export class CoworkFileActivityTracker {
  private readonly sessions = new Map<string, TrackedSession>();

  constructor(private readonly emitActivity: (activity: CoworkFileActivity) => void) {}

  startSession(sessionId: string, cwd: string): void {
    const root = path.resolve(cwd || '');
    if (!root) return;

    try {
      const stat = fs.statSync(root);
      if (!stat.isDirectory()) return;
    } catch {
      return;
    }

    const existing = this.sessions.get(sessionId);
    if (existing?.root === root) {
      if (existing.stopTimer) {
        clearTimeout(existing.stopTimer);
        existing.stopTimer = null;
      }
      return;
    }
    if (existing) {
      this.stopSession(sessionId);
    }

    while (this.sessions.size >= MAX_ACTIVE_WATCHERS) {
      const oldest = this.sessions.keys().next().value as string | undefined;
      if (!oldest) break;
      this.stopSession(oldest);
    }

    const session: TrackedSession = {
      sessionId,
      root,
      watcher: null,
      pendingReads: new Map(),
      pendingDeletes: new Map(),
      knownSignatures: new Map(),
      stopTimer: null,
    };
    const handleChange = (_eventType: string, filename: string | Buffer | null) => {
      if (!filename) return;
      const filenameText = Buffer.isBuffer(filename) ? filename.toString('utf8') : String(filename);
      const filePath = path.resolve(root, filenameText);
      this.scheduleFileSnapshot(session, filePath);
    };
    try {
      try {
        session.watcher = fs.watch(root, { recursive: true }, handleChange);
      } catch {
        session.watcher = fs.watch(root, handleChange);
      }
      session.watcher.on('error', (error) => {
        console.debug('[CoworkFileActivity] watcher stopped after an error:', error);
        this.stopSession(sessionId);
      });
      this.sessions.set(sessionId, session);
    } catch (error) {
      console.debug('[CoworkFileActivity] failed to start workspace watcher:', error);
    }
  }

  stopSession(sessionId: string, delayMs = 0): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (session.stopTimer) {
      clearTimeout(session.stopTimer);
      session.stopTimer = null;
    }
    if (delayMs > 0) {
      session.stopTimer = setTimeout(() => this.stopSession(sessionId), delayMs);
      return;
    }
    session.watcher?.close();
    for (const timer of session.pendingReads.values()) {
      clearTimeout(timer);
    }
    for (const timer of session.pendingDeletes.values()) {
      clearTimeout(timer);
    }
    this.sessions.delete(sessionId);
  }

  stopAll(): void {
    for (const sessionId of Array.from(this.sessions.keys())) {
      this.stopSession(sessionId);
    }
  }

  handleToolMessage(sessionId: string, cwd: string, message: CoworkMessage): void {
    if (message.type !== 'tool_use') return;
    const toolName = normalizeToolName(message.metadata?.toolName);
    const input = isRecord(message.metadata?.toolInput) ? message.metadata.toolInput : undefined;
    if (!input) return;
    const filePath = resolveToolPath(cwd, input);
    if (!filePath || shouldIgnoreActivityPath(path.resolve(cwd), filePath)) return;

    if (toolName === 'write' || toolName === 'writefile') {
      const content = getString(input, ['content', 'text', 'data', 'value']);
      this.emitPreview(sessionId, cwd, filePath, content, CoworkFileActivityStatus.Writing);
      return;
    }

    if (toolName === 'edit' || toolName === 'editfile' || toolName === 'multiedit') {
      this.emitPreview(sessionId, cwd, filePath, collectEditPreview(input), CoworkFileActivityStatus.Writing);
    }
  }

  private emitPreview(
    sessionId: string,
    cwd: string,
    filePath: string,
    content: string | null,
    status: CoworkFileActivityStatus,
  ): void {
    const preview = truncateToolPreviewContent(content);
    this.emitActivity({
      sessionId,
      filePath,
      relativePath: path.relative(path.resolve(cwd), filePath) || path.basename(filePath),
      content: preview.content,
      timestamp: Date.now(),
      status,
      source: CoworkFileActivitySource.ToolPreview,
      language: inferLanguage(filePath),
      truncated: preview.truncated,
    });
  }

  private scheduleFileSnapshot(session: TrackedSession, filePath: string): void {
    if (shouldIgnoreActivityPath(session.root, filePath)) return;
    const pendingDelete = session.pendingDeletes.get(filePath);
    if (pendingDelete) {
      clearTimeout(pendingDelete);
      session.pendingDeletes.delete(filePath);
    }
    const existingTimer = session.pendingReads.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    const timer = setTimeout(() => {
      session.pendingReads.delete(filePath);
      this.emitFileSnapshot(session, filePath);
    }, READ_DEBOUNCE_MS);
    session.pendingReads.set(filePath, timer);
  }

  private scheduleDeletedActivity(session: TrackedSession, filePath: string): void {
    if (!session.knownSignatures.has(filePath)) return;
    const existingTimer = session.pendingDeletes.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    const timer = setTimeout(() => {
      session.pendingDeletes.delete(filePath);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          this.scheduleFileSnapshot(session, filePath);
          return;
        }
      } catch {
        // The file stayed deleted after the debounce window.
      }

      session.knownSignatures.delete(filePath);
      this.emitActivity({
        sessionId: session.sessionId,
        filePath,
        relativePath: path.relative(session.root, filePath) || path.basename(filePath),
        content: null,
        timestamp: Date.now(),
        status: CoworkFileActivityStatus.Deleted,
        source: CoworkFileActivitySource.Watcher,
        language: inferLanguage(filePath),
        truncated: false,
      });
    }, DELETE_DEBOUNCE_MS);
    session.pendingDeletes.set(filePath, timer);
  }

  private emitFileSnapshot(session: TrackedSession, filePath: string): void {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      this.scheduleDeletedActivity(session, filePath);
      return;
    }

    if (!stat.isFile() || stat.size > MAX_FILE_SNAPSHOT_BYTES) return;
    const signature = `${stat.mtimeMs}:${stat.size}`;
    if (session.knownSignatures.get(filePath) === signature) return;
    const existed = session.knownSignatures.has(filePath);
    session.knownSignatures.set(filePath, signature);

    let buffer: Buffer;
    try {
      buffer = fs.readFileSync(filePath);
    } catch {
      return;
    }
    if (isProbablyBinary(buffer)) return;

    this.emitActivity({
      sessionId: session.sessionId,
      filePath,
      relativePath: path.relative(session.root, filePath) || path.basename(filePath),
      content: buffer.toString('utf8'),
      timestamp: Date.now(),
      status: existed ? CoworkFileActivityStatus.Modified : CoworkFileActivityStatus.Added,
      source: CoworkFileActivitySource.Watcher,
      language: inferLanguage(filePath),
      truncated: false,
    });
  }
}
