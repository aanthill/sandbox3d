import type { TerrainToolId } from './brush';

export type WaterToolId = 'pour' | 'fountain' | 'rain' | 'drain';
export type ToolId = TerrainToolId | WaterToolId;

/** Dock order; keys 1..7 select by position. */
export const TERRAIN_TOOLS: readonly TerrainToolId[] = ['raise', 'lower', 'flatten'];
export const WATER_TOOLS: readonly WaterToolId[] = ['pour', 'fountain', 'rain', 'drain'];
export const TOOL_IDS: readonly ToolId[] = [...TERRAIN_TOOLS, ...WATER_TOOLS];

export function isWaterTool(t: ToolId): t is WaterToolId {
  return (WATER_TOOLS as readonly string[]).includes(t);
}

/** Water tuning per tool (world units³ per second at strength 1, unless noted). */
export const WATER_TOOL_TUNING = {
  pourRate: 0.5,
  fountainRate: 0.05,
  /** Rain: drops per fixed step inside the brush at strength 1, and volume per drop. */
  rainDrops: 4,
  rainDropVolume: 0.0012,
  drainRate: 1.2,
  /** Click distance (world units) to remove an existing fountain. */
  fountainPickRadius: 0.25,
} as const;
