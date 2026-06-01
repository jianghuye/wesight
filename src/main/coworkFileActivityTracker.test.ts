import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, expect, test } from 'vitest';

import {
  type CoworkFileActivity,
  CoworkFileActivitySource,
  CoworkFileActivityStatus,
} from '../shared/cowork/fileActivity';
import { CoworkFileActivityTracker, shouldIgnoreActivityPath } from './coworkFileActivityTracker';
import type { CoworkMessage } from './coworkStore';

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-file-activity-'));
  tempDirs.push(dir);
  return dir;
};

const waitFor = async (
  predicate: () => boolean,
  timeoutMs = 1200,
): Promise<void> => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
};

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('shouldIgnoreActivityPath skips generated and external paths', () => {
  const root = makeTempDir();
  expect(shouldIgnoreActivityPath(root, path.join(root, 'src', 'app.ts'))).toBe(false);
  expect(shouldIgnoreActivityPath(root, path.join(root, 'node_modules', 'pkg', 'index.js'))).toBe(true);
  expect(shouldIgnoreActivityPath(root, path.join(root, '.git', 'HEAD'))).toBe(true);
  expect(shouldIgnoreActivityPath(root, path.join(root, 'dist-electron', 'main.js'))).toBe(true);
  expect(shouldIgnoreActivityPath(root, path.join(root, '.vite', 'deps', 'index.js'))).toBe(true);
  expect(shouldIgnoreActivityPath(root, path.join(root, 'release', 'app.dmg'))).toBe(true);
  expect(shouldIgnoreActivityPath(root, path.join(root, 'src', 'app.ts.tmp'))).toBe(true);
  expect(shouldIgnoreActivityPath(root, path.join(root, 'src', '.env'))).toBe(false);
  expect(shouldIgnoreActivityPath(root, path.dirname(root))).toBe(true);
});

test('handleToolMessage emits a write preview before disk snapshot arrives', () => {
  const root = makeTempDir();
  const activities: CoworkFileActivity[] = [];
  const tracker = new CoworkFileActivityTracker((activity) => activities.push(activity));
  const message: CoworkMessage = {
    id: 'tool_1',
    type: 'tool_use',
    content: '',
    timestamp: Date.now(),
    metadata: {
      toolName: 'Write',
      toolInput: {
        file_path: 'src/app.ts',
        content: 'export const answer = 42;\n',
      },
    },
  };

  tracker.handleToolMessage('session_1', root, message);

  expect(activities).toHaveLength(1);
  expect(activities[0]).toMatchObject({
    sessionId: 'session_1',
    relativePath: path.join('src', 'app.ts'),
    content: 'export const answer = 42;\n',
    status: CoworkFileActivityStatus.Writing,
    source: CoworkFileActivitySource.ToolPreview,
  });
});

test('workspace watcher emits text file snapshots and stops with the session', async () => {
  const root = makeTempDir();
  const activities: CoworkFileActivity[] = [];
  const tracker = new CoworkFileActivityTracker((activity) => activities.push(activity));

  tracker.startSession('session_1', root);
  await delay(50);
  fs.writeFileSync(path.join(root, 'index.ts'), 'const value = 1;\n');
  await waitFor(() => activities.some((activity) => activity.relativePath === 'index.ts'));

  const firstSnapshot = activities.find((activity) => activity.relativePath === 'index.ts');
  expect(firstSnapshot).toMatchObject({
    sessionId: 'session_1',
    relativePath: 'index.ts',
    content: 'const value = 1;\n',
    source: CoworkFileActivitySource.Watcher,
  });

  tracker.stopSession('session_1');
  const countAfterStop = activities.length;
  fs.writeFileSync(path.join(root, 'after-stop.ts'), 'const stopped = true;\n');
  await new Promise((resolve) => setTimeout(resolve, 250));
  expect(activities).toHaveLength(countAfterStop);
});

test('workspace watcher debounces atomic rewrites without surfacing a deleted activity', async () => {
  const root = makeTempDir();
  const activities: CoworkFileActivity[] = [];
  const tracker = new CoworkFileActivityTracker((activity) => activities.push(activity));
  const target = path.join(root, 'atomic.ts');

  tracker.startSession('session_1', root);
  await delay(50);
  fs.writeFileSync(target, 'const value = 1;\n');
  await waitFor(() => activities.some((activity) => activity.relativePath === 'atomic.ts'));

  fs.unlinkSync(target);
  fs.writeFileSync(target, 'const value = 2;\n');
  await waitFor(
    () => activities.some((activity) => activity.relativePath === 'atomic.ts' && activity.content === 'const value = 2;\n'),
  );
  await delay(600);

  expect(activities.some((activity) => activity.content === 'const value = 2;\n')).toBe(true);
  expect(activities.some((activity) => activity.status === CoworkFileActivityStatus.Deleted)).toBe(false);
  tracker.stopSession('session_1');
});
