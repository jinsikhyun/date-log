export type ShareRatio = "feed-4x5" | "story-9x16" | "square-1x1";

export const SHARE_OUTPUTS = {
  "feed-4x5": { width: 1080, height: 1350, label: "4:5 피드" },
  "story-9x16": { width: 1080, height: 1920, label: "9:16 스토리" },
  "square-1x1": { width: 1080, height: 1080, label: "1:1 정사각형" },
} as const;

export const SHARE_RATIOS: ShareRatio[] = ["feed-4x5", "story-9x16", "square-1x1"];

export const DEFAULT_SHARE_RATIO: ShareRatio = "feed-4x5";
