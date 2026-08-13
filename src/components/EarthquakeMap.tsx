import { useEffect } from 'react'
import L from 'leaflet'
import 'leaflet.markercluster'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents, ZoomControl } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import type { Earthquake } from '../types'
import { formatMagnitude, magnitudeColor, magnitudeRadius } from '../usgs'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'

const USA_CENTER: [number, number] = [39.5, -98.35]
const USA_ZOOM = 4
const OVERLAY_BREAKPOINT = 720
/** Contiguous west coast — keep this longitude just right of the overlay. */
const WEST_COAST: [number, number] = [40.0, -124.3]
/** Breathing room past the banner for cluster icons. */
const OVERLAY_CLEARANCE = 40

type Props = {
  earthquakes: Earthquake[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}

function overlayRightEdge(): number {
  const selectors = ['.brand', '.brand-block h1', '.lede', '.controls', '.status', '.status-strongest']
  let right = 0
  for (const selector of selectors) {
    const el = document.querySelector(selector)
    if (el) right = Math.max(right, el.getBoundingClientRect().right)
  }
  return right
}

/**
 * Pan only far enough that the west coast clears the title and strongest-quake
 * banner. Centering in the leftover viewport over-shifts on wide screens.
 */
function overlayShift(map: L.Map): L.Point {
  if (map.getSize().x <= OVERLAY_BREAKPOINT) {
    return L.point(0, 0)
  }

  const overlayRight = overlayRightEdge()
  if (overlayRight <= 0) return L.point(0, 0)

  const size = map.getSize()
  const westFromCenter =
    map.project(WEST_COAST, USA_ZOOM).x - map.project(USA_CENTER, USA_ZOOM).x
  const unshiftedWestX = size.x / 2 + westFromCenter
  const needed = Math.round(overlayRight + OVERLAY_CLEARANCE - unshiftedWestX)
  return L.point(Math.max(0, needed), 0)
}

function shiftedLatLng(map: L.Map, latlng: L.LatLngExpression, zoom = map.getZoom()): L.LatLng {
  const shift = overlayShift(map)
  if (shift.x === 0 && shift.y === 0) return L.latLng(latlng)
  return map.unproject(map.project(latlng, zoom).subtract(shift), zoom)
}

function MapInitialView() {
  const map = useMap()

  useEffect(() => {
    const apply = () => {
      map.setView(shiftedLatLng(map, USA_CENTER, USA_ZOOM), USA_ZOOM, { animate: false })
    }

    apply()
    const frame = requestAnimationFrame(apply)
    // Status banner width lands after USGS data; remeasure once so we don't under-shift.
    const later = window.setTimeout(apply, 500)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(later)
    }
  }, [map])

  return null
}

function MapFocus({ selected }: { selected: Earthquake | null }) {
  const map = useMap()

  useEffect(() => {
    if (!selected) return
    // Keep current zoom so switching quakes is a light pan, not a reset.
    map.panTo(shiftedLatLng(map, [selected.latitude, selected.longitude]), {
      animate: true,
      duration: 0.35,
    })
  }, [map, selected])

  return null
}

/** Keep pan / pinch-zoom / scroll-zoom enabled for mouse and touch. */
function MapGestures() {
  const map = useMap()

  useEffect(() => {
    map.dragging.enable()
    map.touchZoom.enable()
    map.doubleClickZoom.enable()
    map.scrollWheelZoom.enable()
    map.boxZoom.enable()
    map.keyboard.enable()

    const container = map.getContainer()
    container.style.touchAction = 'none'
    container.setAttribute(
      'aria-label',
      'Earthquake map. Drag to pan, pinch or use zoom buttons to zoom. Click a quake for details.',
    )
  }, [map])

  return null
}

function MapBackgroundClick({ onClear }: { onClear: () => void }) {
  useMapEvents({
    click: () => onClear(),
  })
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

export function EarthquakeMap({ earthquakes, selectedId, onSelect }: Props) {
  const selected = earthquakes.find((q) => q.id === selectedId) ?? null

  return (
    <MapContainer
      className="quake-map"
      center={USA_CENTER}
      zoom={USA_ZOOM}
      minZoom={3}
      maxZoom={12}
      zoomControl={false}
      dragging
      touchZoom
      doubleClickZoom
      scrollWheelZoom
      boxZoom
      keyboard
      preferCanvas={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      <ZoomControl position="bottomright" />
      <MapGestures />
      <MapInitialView />
      <MapBackgroundClick onClear={() => onSelect(null)} />
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
              click: (event) => {
                L.DomEvent.stopPropagation(event.originalEvent)
                onSelect(quake.id)
              },
            }}
          />
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  )
}
