const CARTO_LIGHT_TILES = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'

/** CARTO raster basemaps require a free API key or tiles show an "API key required" watermark. */
export function cartoTileLayerUrl(): string {
  const key = import.meta.env.VITE_CARTO_API_KEY?.trim()
  if (!key) return CARTO_LIGHT_TILES
  return `${CARTO_LIGHT_TILES}?key=${encodeURIComponent(key)}`
}
