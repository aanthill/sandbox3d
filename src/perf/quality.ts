export type TierId = 'low' | 'medium' | 'high' | 'ultra';

export interface QualityTier {
  id: TierId;
  label: string;
  /** Heightfield resolution (vertices per side). */
  grid: number;
  /** Upper bound for the device pixel ratio at this tier. */
  maxPixelRatio: number;
  shadows: boolean;
  /** Shadow map resolution (0 when shadows are off). */
  shadowMapSize: number;
  /** Glass blur (CSS backdrop-filter) on the UI; costs GPU time, so off on Low/Medium. */
  uiBlur: boolean;
}

/**
 * Quality tiers. "Low" was added after the first PC test (decision #11 update):
 * it is the default and the target for modest GPUs.
 */
export const TIERS: Record<TierId, QualityTier> = {
  low: { id: 'low', label: 'Low', grid: 128, maxPixelRatio: 1, shadows: false, shadowMapSize: 0, uiBlur: false },
  medium: { id: 'medium', label: 'Medium', grid: 256, maxPixelRatio: 1.5, shadows: true, shadowMapSize: 1024, uiBlur: false },
  high: { id: 'high', label: 'High', grid: 512, maxPixelRatio: 2, shadows: true, shadowMapSize: 2048, uiBlur: true },
  ultra: { id: 'ultra', label: 'Ultra', grid: 1024, maxPixelRatio: 2, shadows: true, shadowMapSize: 2048, uiBlur: true },
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
