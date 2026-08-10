import { useEffect } from 'react'
import L from 'leaflet'
import 'leaflet.markercluster'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import type { Earthquake } from '../types'
import {
  formatMagnitude,
  formatQuakeTime,
  magnitudeColor,
  magnitudeRadius,
  parsePlace,
} from '../usgs'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'

const USA_CENTER: [number, number] = [39.5, -98.35]
const USA_ZOOM = 4

type Props = {
  earthquakes: Earthquake[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}

function MapFocus({ selected }: { selected: Earthquake | null }) {
  const map = useMap()

  useEffect(() => {
    if (!selected) return
    map.flyTo([selected.latitude, selected.longitude], Math.max(map.getZoom(), 7), {
      duration: 0.85,
    })
  }, [map, selected])

  return null
}

function createQuakeIcon(magnitude: number | null, selected: boolean): L.DivIcon {
  const radius = magnitudeRadius(magnitude) + (selected ? 3 : 0)
  const size = Math.round(radius * 2)
  const color = magnitudeColor(magnitude)
  const ring = selected ? '3px solid #0d3b4c' : `1.5px solid ${color}`
  const magKey = magnitude === null || Number.isNaN(magnitude) ? 'na' : magnitude.toFixed(1)

  return L.divIcon({
    className: `quake-div-icon quake-mag-${magKey}${selected ? ' is-selected' : ''}`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
    html: `<span class="quake-dot" style="width:${size}px;height:${size}px;background:${color};border:${ring};opacity:${selected ? 0.95 : 0.78}"></span>`,
  })
}

function markerMagnitude(marker: L.Marker): number {
  const className = marker.options.icon?.options?.className ?? ''
  const match = className.match(/quake-mag-([\d.]+|na)/)
  if (!match || match[1] === 'na') return 0
  const value = Number(match[1])
  return Number.isFinite(value) ? value : 0
}

function createClusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const childMarkers = cluster.getAllChildMarkers()
  let maxMag = 0
  for (const marker of childMarkers) {
    maxMag = Math.max(maxMag, markerMagnitude(marker))
  }

  const count = cluster.getChildCount()
  const color = magnitudeColor(maxMag)
  const size = count >= 100 ? 48 : count >= 25 ? 42 : 36

  return L.divIcon({
    className: 'quake-cluster-icon',
    iconSize: [size, size],
    html: `<span class="quake-cluster" style="--cluster-color:${color};width:${size}px;height:${size}px">
      <strong>${count}</strong>
      <em>max M${formatMagnitude(maxMag)}</em>
    </span>`,
  })
}

function QuakePopup({ quake }: { quake: Earthquake }) {
  const { locale, state } = parsePlace(quake.place)

  return (
    <div className="quake-popup">
      <p className="quake-popup-mag" style={{ color: magnitudeColor(quake.magnitude) }}>
        M {formatMagnitude(quake.magnitude)}
      </p>
      <dl>
        <div>
          <dt>Locale</dt>
          <dd>{locale}</dd>
        </div>
        <div>
          <dt>State</dt>
          <dd>{state ?? '—'}</dd>
        </div>
        <div>
          <dt>When</dt>
          <dd>
            <time dateTime={new Date(quake.time).toISOString()}>
              {formatQuakeTime(quake.time)}
            </time>
          </dd>
        </div>
        <div>
          <dt>Strength</dt>
          <dd>Magnitude {formatMagnitude(quake.magnitude)}</dd>
        </div>
      </dl>
      <a href={quake.url} target="_blank" rel="noreferrer">
        USGS event page
      </a>
    </div>
  )
}

export function EarthquakeMap({ earthquakes, selectedId, onSelect }: Props) {
  const selected = earthquakes.find((q) => q.id === selectedId) ?? null

  return (
    <MapContainer
      className="quake-map"
      center={USA_CENTER}
      zoom={USA_ZOOM}
      minZoom={3}
      maxZoom={12}
      scrollWheelZoom
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      <MapFocus selected={selected} />
      <MarkerClusterGroup
        chunkedLoading
        showCoverageOnHover={false}
        spiderfyOnMaxZoom
        zoomToBoundsOnClick
        maxClusterRadius={55}
        disableClusteringAtZoom={9}
        iconCreateFunction={createClusterIcon}
      >
        {earthquakes.map((quake) => (
          <Marker
            key={quake.id}
            position={[quake.latitude, quake.longitude]}
            icon={createQuakeIcon(quake.magnitude, quake.id === selectedId)}
            eventHandlers={{
              click: () => onSelect(quake.id),
              popupclose: () => {
                if (selectedId === quake.id) onSelect(null)
              },
            }}
          >
            <Popup>
              <QuakePopup quake={quake} />
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  )
}
