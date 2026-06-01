export const ActivitySidebarResize = {
  StorageKey: 'wesight:coworkActivitySidebarWidth',
  DefaultWidth: 420,
  MinWidth: 360,
  MaxWidth: 900,
  MaxViewportRatio: 0.7,
} as const;

export const getActivitySidebarMaxWidth = (viewportWidth: number): number => {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    return ActivitySidebarResize.MaxWidth;
  }
  return Math.max(
    ActivitySidebarResize.MinWidth,
    Math.min(ActivitySidebarResize.MaxWidth, Math.floor(viewportWidth * ActivitySidebarResize.MaxViewportRatio)),
  );
};

export const clampActivitySidebarWidth = (width: number, viewportWidth: number): number => {
  const fallback = ActivitySidebarResize.DefaultWidth;
  const normalizedWidth = Number.isFinite(width) ? width : fallback;
  return Math.min(
    getActivitySidebarMaxWidth(viewportWidth),
    Math.max(ActivitySidebarResize.MinWidth, Math.round(normalizedWidth)),
  );
};

export const parseStoredActivitySidebarWidth = (value: string | null, viewportWidth: number): number => {
  if (!value) {
    return clampActivitySidebarWidth(ActivitySidebarResize.DefaultWidth, viewportWidth);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return clampActivitySidebarWidth(ActivitySidebarResize.DefaultWidth, viewportWidth);
  }
  return clampActivitySidebarWidth(parsed, viewportWidth);
};
