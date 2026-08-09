import type { Earthquake, TimeframeId, UsgsFeature, UsgsFeatureCollection } from './types'
import { TIMEFRAMES } from './types'

/** Geographic regions that count as “USA” for this map. */
const USA_REGIONS: Array<{
  minLat: number
  maxLat: number
  minLon: number
  maxLon: number
}> = [
  // Contiguous United States
  { minLat: 24.5, maxLat: 49.5, minLon: -125.0, maxLon: -66.5 },
  // Alaska (includes Aleutians west of −180 via a second band)
  { minLat: 51.0, maxLat: 72.0, minLon: -180.0, maxLon: -129.0 },
  { minLat: 51.0, maxLat: 72.0, minLon: 172.0, maxLon: 180.0 },
  // Hawaii
  { minLat: 18.5, maxLat: 22.5, minLon: -161.0, maxLon: -154.0 },
  // Puerto Rico & U.S. Virgin Islands
  { minLat: 17.5, maxLat: 18.6, minLon: -68.0, maxLon: -64.5 },
]

const QUERY_BOUNDS = {
  minlatitude: 17.5,
  maxlatitude: 72.0,
  minlongitude: -180,
  maxlongitude: -64.5,
}

const USGS_QUERY = 'https://earthquake.usgs.gov/fdsnws/event/1/query'

function toIsoUtc(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, '')
}

function isInUsa(lat: number, lon: number): boolean {
  return USA_REGIONS.some(
    (r) => lat >= r.minLat && lat <= r.maxLat && lon >= r.minLon && lon <= r.maxLon,
  )
}

function featureToEarthquake(feature: UsgsFeature): Earthquake | null {
  const [longitude, latitude, depth] = feature.geometry.coordinates
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    Number.isNaN(latitude) ||
    Number.isNaN(longitude)
  ) {
    return null
  }

  if (!isInUsa(latitude, longitude)) return null

  const props = feature.properties
  if (props.type && props.type !== 'earthquake') return null

  return {
    id: feature.id,
    magnitude: props.mag,
    place: props.place ?? 'Unknown location',
    time: props.time,
    updated: props.updated,
    url: props.url,
    tsunami: props.tsunami === 1,
    magType: props.magType,
    status: props.status,
    latitude,
    longitude,
    depthKm: typeof depth === 'number' ? depth : null,
    title: props.title ?? `M ${props.mag ?? '?'} — ${props.place ?? 'Unknown'}`,
  }
}

export function timeframeHours(id: TimeframeId): number {
  return TIMEFRAMES.find((t) => t.id === id)?.hours ?? 24
}

export async function fetchUsaEarthquakes(
  timeframe: TimeframeId,
  signal?: AbortSignal,
): Promise<{ earthquakes: Earthquake[]; fetchedAt: number }> {
  const hours = timeframeHours(timeframe)
  const end = new Date()
  const start = new Date(end.getTime() - hours * 60 * 60 * 1000)

  const params = new URLSearchParams({
    format: 'geojson',
    eventtype: 'earthquake',
    orderby: 'time',
    starttime: toIsoUtc(start),
    endtime: toIsoUtc(end),
    minlatitude: String(QUERY_BOUNDS.minlatitude),
    maxlatitude: String(QUERY_BOUNDS.maxlatitude),
    minlongitude: String(QUERY_BOUNDS.minlongitude),
    maxlongitude: String(QUERY_BOUNDS.maxlongitude),
    limit: '20000',
  })

  const response = await fetch(`${USGS_QUERY}?${params}`, { signal })
  if (!response.ok) {
    throw new Error(`USGS request failed (${response.status})`)
  }

  const data = (await response.json()) as UsgsFeatureCollection
  const earthquakes = data.features
    .map(featureToEarthquake)
    .filter((quake): quake is Earthquake => quake !== null)
    .sort((a, b) => b.time - a.time)

  return {
    earthquakes,
    fetchedAt: data.metadata.generated || Date.now(),
  }
}

export function magnitudeColor(mag: number | null): string {
  const m = mag ?? 0
  if (m >= 6) return '#9b2226'
  if (m >= 5) return '#ae2012'
  if (m >= 4) return '#bb3e03'
  if (m >= 3) return '#ca6702'
  if (m >= 2) return '#ee9b00'
  if (m >= 1) return '#e9c46a'
  return '#94a3b8'
}

export function magnitudeRadius(mag: number | null): number {
  const m = Math.max(0, mag ?? 0)
  return Math.min(22, 5 + m * 2.6)
}

export function formatQuakeTime(ms: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(ms))
}

export function formatMagnitude(mag: number | null): string {
  if (mag === null || Number.isNaN(mag)) return '—'
  return mag.toFixed(1)
}
