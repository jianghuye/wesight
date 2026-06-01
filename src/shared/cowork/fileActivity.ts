export const CoworkFileActivityStatus = {
  Writing: 'writing',
  Modified: 'modified',
  Added: 'added',
  Deleted: 'deleted',
} as const;
export type CoworkFileActivityStatus = typeof CoworkFileActivityStatus[keyof typeof CoworkFileActivityStatus];

export const CoworkFileActivitySource = {
  Watcher: 'watcher',
  ToolPreview: 'tool_preview',
} as const;
export type CoworkFileActivitySource = typeof CoworkFileActivitySource[keyof typeof CoworkFileActivitySource];

export interface CoworkFileActivity {
  sessionId: string;
  filePath: string;
  relativePath: string;
  content: string | null;
  timestamp: number;
  status: CoworkFileActivityStatus;
  source: CoworkFileActivitySource;
  language: string | null;
  truncated: boolean;
}
