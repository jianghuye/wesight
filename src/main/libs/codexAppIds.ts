const CODEX_APP_THREAD_ID_PREFIX = 'codex-app:';

export const encodeCodexAppThreadId = (threadId: string): string => (
  `${CODEX_APP_THREAD_ID_PREFIX}${threadId}`
);

export const decodeCodexAppThreadId = (value: string | null | undefined): string | null => {
  if (!value?.startsWith(CODEX_APP_THREAD_ID_PREFIX)) return null;
  return value.slice(CODEX_APP_THREAD_ID_PREFIX.length) || null;
};

export const buildCodexAppSessionId = (threadId: string): string => (
  `codex-app-${threadId.replace(/[^a-zA-Z0-9_-]/g, '-')}`
);
