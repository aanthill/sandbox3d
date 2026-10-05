export type TierId = 'low' | 'medium' | 'high' | 'ultra';

export interface QualityTier {
  id: TierId;
  label: string;
  /** Heightfield resolution (vertices per side). */
  grid: number;
  /** Upper bound for the device pixel ratio at this tier. */
  maxPixelRatio: number;
  /** Glass blur (CSS backdrop-filter) on the UI; costs GPU time, so off on Low/Medium. */
  uiBlur: boolean;
  /** Splash droplet pool size. */
  splash: number;
  /** Plant candidates (grass tufts + trees); CLAUDE.md quality table. */
  plants: number;
  /** Rain streak count. */
  rain: number;
}

/**
 * Quality tiers. "Low" was added after the first PC test (decision #11 update):
 * it is the default and the target for modest GPUs.
 */
export const TIERS: Record<TierId, QualityTier> = {
  low: { plants: 15000, rain: 1200, splash: 300, id: 'low', label: 'Low', grid: 128, maxPixelRatio: 1, uiBlur: false },
  medium: { plants: 50000, rain: 3000, splash: 900, id: 'medium', label: 'Medium', grid: 256, maxPixelRatio: 1.5, uiBlur: false },
  high: { plants: 150000, rain: 6000, splash: 2000, id: 'high', label: 'High', grid: 512, maxPixelRatio: 2, uiBlur: true },
  ultra: { plants: 300000, rain: 8000, splash: 2000, id: 'ultra', label: 'Ultra', grid: 1024, maxPixelRatio: 2, uiBlur: true },
};

export const TIER_ORDER: readonly TierId[] = ['low', 'medium', 'high', 'ultra'];
export const DEFAULT_TIER: TierId = 'low';

export function isTierId(value: unknown): value is TierId {
  return typeof value === 'string' && value in TIERS;
}

const STORAGE_KEY = 'sandbox3d.tier';

/** Best-effort persistence: storage can be blocked, so never let it throw. */
export function loadTier(): TierId {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (isTierId(v)) return v;
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_TIER;
}

export function saveTier(id: TierId): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* storage unavailable */
  }
}
