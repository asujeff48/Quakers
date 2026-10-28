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

/** Marker / legend colors by USGS magnitude band. */
export function magnitudeColor(mag: number | null): string {
  const m = mag ?? 0
  if (m >= 9) return '#1e3a8a' // 9–9.99 dark blue
  if (m >= 8) return '#7dd3fc' // 8–8.99 light blue
  if (m >= 7) return '#dc2626' // 7–7.99 red
  if (m >= 6) return '#16a34a' // 6–6.99 green
  if (m >= 5) return '#7c3aed' // 5–5.99 purple
  if (m >= 4) return '#eab308' // 4–4.99 yellow
  if (m >= 3) return '#92400e' // 3–3.99 brown
  if (m >= 1) return '#ec4899' // 1–2.99 pink
  return '#94a3b8' // below 1
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

/** Compact age for the list. Older events fall back to the local timestamp. */
export function formatRelativeTime(ms: number, now = Date.now()): string {
  const delta = now - ms
  if (!Number.isFinite(delta) || delta < 0) return formatQuakeTime(ms)
  const minutes = Math.floor(delta / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(delta / 3_600_000)
  if (hours < 24) return hours === 1 ? '1 hr ago' : `${hours} hr ago`
  const days = Math.floor(delta / 86_400_000)
  if (days < 45) return days === 1 ? '1 day ago' : `${days} days ago`
  return formatQuakeTime(ms)
}

export function formatMagnitude(mag: number | null): string {
  if (mag === null || Number.isNaN(mag)) return '—'
  return mag.toFixed(1)
}

export function formatDepthKm(depthKm: number | null): string | null {
  if (depthKm === null || Number.isNaN(depthKm)) return null
  return `${depthKm.toFixed(1)} km`
}

export type QuakeSort = 'newest' | 'magnitude'

/** Newest first, or strongest first with newest breaking ties. Does not mutate. */
export function sortQuakes(quakes: readonly Earthquake[], sort: QuakeSort): Earthquake[] {
  const copy = [...quakes]
  copy.sort((a, b) => {
    if (sort === 'magnitude') {
      const byMag =
        (b.magnitude ?? Number.NEGATIVE_INFINITY) - (a.magnitude ?? Number.NEGATIVE_INFINITY)
      if (byMag !== 0) return byMag
    }
    if (a.time !== b.time) return b.time - a.time
    if (a.id < b.id) return -1
    if (a.id > b.id) return 1
    return 0
  })
  return copy
}

function channelLuminance(channel: number): number {
  const srgb = channel / 255
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16)
  const red = channelLuminance((value >> 16) & 255)
  const green = channelLuminance((value >> 8) & 255)
  const blue = channelLuminance(value & 255)
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

/** Text color that stays readable on `magnitudeColor`. */
export function magnitudeInk(mag: number | null): string {
  return relativeLuminance(magnitudeColor(mag)) > 0.183 ? '#152029' : '#f8fbfc'
}

const KM_TO_MILES = 0.621371

function formatMiles(km: number): string {
  const miles = km * KM_TO_MILES
  if (miles < 10) {
    const text = miles.toFixed(1)
    return text.endsWith('.0') ? text.slice(0, -2) : text
  }
  return String(Math.round(miles))
}

/** USGS place with km distances shown in miles, e.g. "1.9 mi NNW of Murrieta, CA". */
export function formatPlace(place: string): string {
  const trimmed = place.trim()
  if (!trimmed) return 'Unknown location'

  const ofMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*km\s+([A-Za-z]+)\s+of\s+(.+)$/i)
  if (ofMatch) {
    return `${formatMiles(Number(ofMatch[1]))} mi ${ofMatch[2]} of ${ofMatch[3].trim()}`
  }

  return trimmed.replace(/(\d+(?:\.\d+)?)\s*km\b/gi, (_, value: string) => `${formatMiles(Number(value))} mi`)
}

/** Split USGS place strings like "3 km NNW of Murrieta, CA" into locale + state. */
export function parsePlace(place: string): { locale: string; state: string | null } {
  const trimmed = place.trim()
  if (!trimmed) return { locale: 'Unknown location', state: null }

  const ofMatch = trimmed.match(
    /^(?:\d+(?:\.\d+)?\s*km\s+[A-Za-z]+\s+of\s+)(.+),\s*([^,]+)$/i,
  )
  if (ofMatch) {
    return { locale: ofMatch[1].trim(), state: ofMatch[2].trim() }
  }

  const comma = trimmed.match(/^(.+),\s*([^,]+)$/)
  if (comma) {
    return { locale: comma[1].trim(), state: comma[2].trim() }
  }

  return { locale: trimmed, state: null }
}
