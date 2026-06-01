import { CoworkFileActivitySource } from '@shared/cowork/fileActivity';
import { expect, test } from 'vitest';

import { CoworkActivitySidebarMode } from './activitySidebarConstants';
import {
  ActivitySidebarResize,
  clampActivitySidebarWidth,
  getActivitySidebarMaxWidth,
  parseStoredActivitySidebarWidth,
} from './activitySidebarResize';
import {
  getLiveCodeInitialLineLimit,
  LIVE_CODE_AUTO_FOLLOW_THRESHOLD_PX,
  shouldAutoFollowLiveCodeScroll,
} from './liveCodePreviewUtils';

test('runtime monitor is a separate activity sidebar mode', () => {
  expect(CoworkActivitySidebarMode.RuntimeMonitor).toBe('runtime_monitor');
  expect(Object.values(CoworkActivitySidebarMode)).toEqual([
    'overview',
    'runtime_monitor',
    'live_code',
    'code_diff',
  ]);
});

test('activity sidebar width is clamped to desktop limits', () => {
  expect(clampActivitySidebarWidth(100, 1440)).toBe(ActivitySidebarResize.MinWidth);
  expect(clampActivitySidebarWidth(1000, 1200)).toBe(840);
  expect(clampActivitySidebarWidth(1200, 2000)).toBe(ActivitySidebarResize.MaxWidth);
  expect(getActivitySidebarMaxWidth(1200)).toBe(840);
});

test('activity sidebar width restores from local storage safely', () => {
  expect(parseStoredActivitySidebarWidth(null, 1440)).toBe(ActivitySidebarResize.DefaultWidth);
  expect(parseStoredActivitySidebarWidth('480', 1440)).toBe(480);
  expect(parseStoredActivitySidebarWidth('nope', 1440)).toBe(ActivitySidebarResize.DefaultWidth);
  expect(parseStoredActivitySidebarWidth('9999', 1200)).toBe(840);
});

test('watcher snapshots show all live code lines immediately', () => {
  expect(getLiveCodeInitialLineLimit(CoworkFileActivitySource.Watcher, 420, 0, false)).toBe(420);
});

test('tool previews start progressively and can continue from the previous limit', () => {
  expect(getLiveCodeInitialLineLimit(CoworkFileActivitySource.ToolPreview, 420, 0, false)).toBe(24);
  expect(getLiveCodeInitialLineLimit(CoworkFileActivitySource.ToolPreview, 420, 120, true)).toBe(120);
});

test('live code only follows scroll when the viewer is near the bottom', () => {
  expect(shouldAutoFollowLiveCodeScroll(LIVE_CODE_AUTO_FOLLOW_THRESHOLD_PX - 1)).toBe(true);
  expect(shouldAutoFollowLiveCodeScroll(LIVE_CODE_AUTO_FOLLOW_THRESHOLD_PX)).toBe(false);
});
