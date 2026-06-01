import { describe, expect, test } from 'vitest';

import type { CoworkSession } from '../types/cowork';
import type { Skill } from '../types/skill';
import {
  ActivityItemStatus,
  ActivityTodoStatus,
  buildCoworkActivitySnapshot,
  getPreferredActivityFileChangeId,
} from './coworkActivity';

const makeSession = (messages: CoworkSession['messages']): CoworkSession => ({
  id: 'session-1',
  title: 'Activity test',
  claudeSessionId: null,
  status: 'running',
  pinned: false,
  cwd: '/tmp/project',
  systemPrompt: '',
  executionMode: 'local',
  activeSkillIds: [],
  agentId: 'main',
  createdAt: 1,
  updatedAt: 1,
  messages,
});

const skills: Skill[] = [
  {
    id: 'web-dev',
    name: 'Web Dev',
    description: 'Build web interfaces',
    enabled: true,
    isOfficial: true,
    isBuiltIn: false,
    updatedAt: 1,
    prompt: '',
    skillPath: '/skills/web-dev/SKILL.md',
  },
];

describe('buildCoworkActivitySnapshot', () => {
  test('extracts todos and skills from session messages', () => {
    const snapshot = buildCoworkActivitySnapshot(makeSession([
      {
        id: 'user-1',
        type: 'user',
        content: 'build this',
        timestamp: 1,
        metadata: { skillIds: ['web-dev'] },
      },
      {
        id: 'tool-1',
        type: 'tool_use',
        content: 'Using tool: TodoWrite',
        timestamp: 2,
        metadata: {
          toolName: 'TodoWrite',
          toolInput: {
            todos: [
              { content: 'Create layout', status: 'completed' },
              { content: 'Wire sidebar', activeForm: 'Wiring sidebar', status: 'in_progress' },
            ],
          },
        },
      },
    ]), skills);

    expect(snapshot.skills).toEqual([
      { id: 'web-dev', name: 'Web Dev', description: 'Build web interfaces' },
    ]);
    expect(snapshot.todos).toEqual([
      {
        id: 'todo-0',
        text: 'Create layout',
        secondaryText: null,
        status: ActivityTodoStatus.Completed,
      },
      {
        id: 'todo-1',
        text: 'Wiring sidebar',
        secondaryText: 'Wire sidebar',
        status: ActivityTodoStatus.InProgress,
      },
    ]);
  });

  test('extracts edit diffs and marks completed tools', () => {
    const snapshot = buildCoworkActivitySnapshot(makeSession([
      {
        id: 'tool-1',
        type: 'tool_use',
        content: 'Using tool: Edit',
        timestamp: 2,
        metadata: {
          toolName: 'Edit',
          toolUseId: 'edit-1',
          toolInput: {
            file_path: '/tmp/project/app.ts',
            old_str: 'const a = 1;',
            new_str: 'const a = 2;',
          },
        },
      },
      {
        id: 'result-1',
        type: 'tool_result',
        content: 'ok',
        timestamp: 3,
        metadata: { toolUseId: 'edit-1', toolResult: 'ok' },
      },
    ]), skills);

    expect(snapshot.fileChanges).toHaveLength(1);
    expect(snapshot.fileChanges[0]).toMatchObject({
      id: 'tool-1:diff:0',
      filePath: '/tmp/project/app.ts',
      status: ActivityItemStatus.Completed,
      addedLines: 1,
      removedLines: 1,
    });
    expect(snapshot.fileChanges[0].diffs).toHaveLength(1);
  });

  test('extracts write and file artifacts', () => {
    const snapshot = buildCoworkActivitySnapshot(makeSession([
      {
        id: 'tool-1',
        type: 'tool_use',
        content: 'Using tool: Write',
        timestamp: 2,
        metadata: {
          toolName: 'Write',
          toolInput: {
            path: '/tmp/project/index.html',
            content: '<html>\n</html>',
          },
        },
      },
      {
        id: 'assistant-1',
        type: 'assistant',
        content: 'Done',
        timestamp: 3,
        metadata: {
          generatedImages: [
            { path: '/tmp/project/image.png', name: 'image.png', mimeType: 'image/png' },
          ],
        },
      },
    ]), skills);

    expect(snapshot.fileChanges[0]).toMatchObject({
      id: 'tool-1:write',
      filePath: '/tmp/project/index.html',
      addedLines: 2,
      removedLines: 0,
    });
    expect(snapshot.fileChanges[0].diffs).toEqual([
      {
        filePath: '/tmp/project/index.html',
        oldStr: '',
        newStr: '<html>\n</html>',
      },
    ]);
    expect(snapshot.artifacts).toEqual([
      {
        id: 'generated:/tmp/project/image.png',
        path: '/tmp/project/image.png',
        name: 'image.png',
        type: 'image',
        source: null,
        timestamp: 3,
      },
    ]);
  });

  test('tracks active running tool', () => {
    const snapshot = buildCoworkActivitySnapshot(makeSession([
      {
        id: 'tool-1',
        type: 'tool_use',
        content: 'Using tool: Bash',
        timestamp: 2,
        metadata: {
          toolName: 'Bash',
          toolInput: { command: 'npm test' },
        },
      },
    ]), skills);

    expect(snapshot.activeTool).toMatchObject({
      toolName: 'Bash',
      status: ActivityItemStatus.Running,
      summary: 'npm test',
    });
  });

  test('prefers a running file change for code diff focus', () => {
    const snapshot = buildCoworkActivitySnapshot(makeSession([
      {
        id: 'tool-1',
        type: 'tool_use',
        content: 'Using tool: Edit',
        timestamp: 2,
        metadata: {
          toolName: 'Edit',
          toolUseId: 'edit-1',
          toolInput: {
            file_path: '/tmp/project/a.ts',
            old_str: 'a',
            new_str: 'b',
          },
        },
      },
      {
        id: 'result-1',
        type: 'tool_result',
        content: 'ok',
        timestamp: 3,
        metadata: { toolUseId: 'edit-1', toolResult: 'ok' },
      },
      {
        id: 'tool-2',
        type: 'tool_use',
        content: 'Using tool: Write',
        timestamp: 4,
        metadata: {
          toolName: 'Write',
          toolInput: {
            file_path: '/tmp/project/b.ts',
            content: 'export const b = 1;',
          },
        },
      },
    ]), skills);

    expect(getPreferredActivityFileChangeId(snapshot)).toBe('tool-2:write');
  });
});
