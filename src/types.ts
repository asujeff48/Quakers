export type TimeframeId = '24h' | '48h' | '1w' | '1m'

export type TimeframeOption = {
  id: TimeframeId
  label: string
  shortLabel: string
  hours: number
}

export const TIMEFRAMES: TimeframeOption[] = [
  { id: '24h', label: 'Last 24 hours', shortLabel: '24h', hours: 24 },
  { id: '48h', label: 'Last 48 hours', shortLabel: '48h', hours: 48 },
  { id: '1w', label: 'Last 1 week', shortLabel: '1 week', hours: 24 * 7 },
  { id: '1m', label: 'Last 1 month', shortLabel: '1 month', hours: 24 * 30 },
]

export const DEFAULT_TIMEFRAME: TimeframeId = '24h'

export type Earthquake = {
  id: string
  magnitude: number | null
  place: string
  time: number
  updated: number
  url: string
  tsunami: boolean
  magType: string | null
  status: string | null
  latitude: number
  longitude: number
  depthKm: number | null
  title: string
}

export type UsgsFeature = {
  id: string
  properties: {
    mag: number | null
    place: string | null
    time: number
    updated: number
    url: string
    tsunami: number | null
    magType: string | null
    status: string | null
    title: string | null
    type: string | null
  }
  geometry: {
    type: string
    coordinates: [number, number, number?]
  }
}

export type UsgsFeatureCollection = {
  type: 'FeatureCollection'
  metadata: {
    generated: number
    count: number
    title: string
  }
  features: UsgsFeature[]
}
