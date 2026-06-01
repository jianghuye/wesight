import { CoworkFileActivitySource } from '@shared/cowork/fileActivity';

export const LIVE_CODE_AUTO_FOLLOW_THRESHOLD_PX = 80;

export const getLiveCodeInitialLineLimit = (
  source: CoworkFileActivitySource,
  targetLineCount: number,
  currentLineLimit: number,
  sameFile: boolean,
): number => {
  if (source === CoworkFileActivitySource.Watcher) return targetLineCount;
  if (sameFile && currentLineLimit > 0 && currentLineLimit < targetLineCount) {
    return currentLineLimit;
  }
  return Math.min(targetLineCount, 24);
};

export const shouldAutoFollowLiveCodeScroll = (distanceFromBottom: number): boolean => (
  distanceFromBottom < LIVE_CODE_AUTO_FOLLOW_THRESHOLD_PX
);
