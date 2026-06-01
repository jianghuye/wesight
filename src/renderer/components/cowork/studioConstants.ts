export const CoworkSessionViewMode = {
  Chat: 'chat',
  Studio: 'studio',
} as const;
export type CoworkSessionViewMode = typeof CoworkSessionViewMode[keyof typeof CoworkSessionViewMode];

export const CoworkStudioState = {
  Idle: 'idle',
  Writing: 'writing',
  Researching: 'researching',
  Executing: 'executing',
  Syncing: 'syncing',
  Error: 'error',
} as const;
export type CoworkStudioState = typeof CoworkStudioState[keyof typeof CoworkStudioState];
