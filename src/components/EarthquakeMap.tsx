import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import L from 'leaflet'
import 'leaflet.markercluster'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents, ZoomControl } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import type { Earthquake } from '../types'
import { formatMagnitude, formatQuakeTime, magnitudeColor, magnitudeRadius, parsePlace } from '../usgs'
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

/**
 * Right edge of painted ink. Flex/grid chrome stretches to the 44rem column, and
 * Range line boxes can match that full width — both would shove the map too far right.
 */
function contentRight(el: Element): number {
  const style = getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden') return 0

  const display = style.display
  const shrinkWrap =
    display === 'inline' || display === 'inline-block' || display === 'inline-flex'

  if (shrinkWrap) return el.getBoundingClientRect().right

  if (display === 'flex' || display === 'grid' || display === 'inline-grid') {
    let right = 0
    for (const child of el.children) {
      right = Math.max(right, contentRight(child))
    }
    return right
  }

  const range = document.createRange()
  range.selectNodeContents(el)
  const rects = Array.from(range.getClientRects())
  if (rects.length === 0) {
    let right = 0
    for (const child of el.children) {
      right = Math.max(right, contentRight(child))
    }
    return right
  }
  return Math.max(...rects.map((rect) => rect.right))
}

function overlayRightEdge(): number {
  // Desktop: sit just past the strongest-quake banner (pill + location line).
  // Title/lede are narrower and sit higher, so they are not the limiter.
  const selectors = ['.status', '.status-strongest']
  let right = 0
  for (const selector of selectors) {
    const el = document.querySelector(selector)
    if (el) right = Math.max(right, contentRight(el))
  }
  return right
}

/**
 * Pan only far enough that the west coast clears the strongest-quake banner.
 * Centering in the leftover viewport over-shifts on wide screens.
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
    window.addEventListener('resize', apply)

    const overlay = document.querySelector('.status-rail')
    if (!overlay) {
      return () => {
        cancelAnimationFrame(frame)
        window.removeEventListener('resize', apply)
      }
    }

    const observer = new ResizeObserver(apply)
    observer.observe(overlay)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', apply)
      observer.disconnect()
    }
  }, [map])

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

type Bubble = {
  quake: Earthquake
  lat: number
  lng: number
  note?: string
}

function quakeLocation(quake: Earthquake): string {
  const place = parsePlace(quake.place)
  return place.state ? `${place.locale}, ${place.state}` : place.locale
}

function isMarkerClickTarget(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : target instanceof Node ? target.parentElement : null
  return Boolean(
    el?.closest(
      '.quake-div-icon, .quake-cluster-icon, .quake-cluster, .quake-dot, .leaflet-marker-icon, .quake-bubble-wrap',
    ),
  )
}

function QuakeDetailBubble({ bubble, onClose }: { bubble: Bubble; onClose: () => void }) {
  const map = useMap()
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const update = () => {
      const point = map.latLngToContainerPoint([bubble.lat, bubble.lng])
      const rect = map.getContainer().getBoundingClientRect()
      setPos({ x: rect.left + point.x, y: rect.top + point.y })
    }

    update()
    map.on('move zoom viewreset', update)
    window.addEventListener('resize', update)
    return () => {
      map.off('move zoom viewreset', update)
      window.removeEventListener('resize', update)
    }
  }, [map, bubble.lat, bubble.lng])

  const host = document.querySelector('.app')
  if (!host || !pos) return null

  return createPortal(
    <div
      className="quake-bubble-wrap"
      style={{ left: pos.x, top: pos.y }}
      role="dialog"
      aria-label="Earthquake details"
    >
      <button type="button" className="quake-bubble-close" aria-label="Close details" onClick={onClose}>
        ×
      </button>
      <p className="quake-bubble-mag" style={{ color: magnitudeColor(bubble.quake.magnitude) }}>
        M {formatMagnitude(bubble.quake.magnitude)}
      </p>
      <p className="quake-bubble-place">{quakeLocation(bubble.quake)}</p>
      <time className="quake-bubble-time" dateTime={new Date(bubble.quake.time).toISOString()}>
        {formatQuakeTime(bubble.quake.time)}
      </time>
      {bubble.note ? <p className="quake-bubble-note">{bubble.note}</p> : null}
    </div>,
    host,
  )
}

function MapBackgroundClick({ onClear }: { onClear: () => void }) {
  useMapEvents({
    click: (event) => {
      if (isMarkerClickTarget(event.originalEvent.target)) return
      onClear()
    },
  })
  return null
}

const markerQuakeIds = new WeakMap<L.Marker, string>()

function createQuakeIcon(magnitude: number | null, selected: boolean, id: string): L.DivIcon {
  const radius = magnitudeRadius(magnitude) + (selected ? 3 : 0)
  const size = Math.round(radius * 2)
  const color = magnitudeColor(magnitude)
  const ring = selected ? '3px solid #0d3b4c' : `1.5px solid ${color}`
  const magKey = magnitude === null || Number.isNaN(magnitude) ? 'na' : magnitude.toFixed(1)

  return L.divIcon({
    className: `quake-div-icon quake-mag-${magKey} quake-id-${id}${selected ? ' is-selected' : ''}`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<span class="quake-dot" style="width:${size}px;height:${size}px;background:${color};border:${ring};opacity:${selected ? 0.95 : 0.78}"></span>`,
  })
}

function markerQuakeId(marker: L.Marker): string | null {
  return (
    markerQuakeIds.get(marker) ??
    marker.options.icon?.options?.className?.match(/quake-id-(\S+)/)?.[1] ??
    null
  )
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
  const [bubble, setBubble] = useState<Bubble | null>(null)
  const skipMapClick = useRef(false)

  useEffect(() => {
    setBubble(null)
  }, [earthquakes])

  const clearBubble = () => {
    setBubble(null)
    onSelect(null)
  }

  const showBubble = (quake: Earthquake, lat: number, lng: number, note?: string) => {
    skipMapClick.current = true
    window.setTimeout(() => {
      skipMapClick.current = false
    }, 50)
    setBubble({ quake, lat, lng, note })
    onSelect(quake.id)
  }

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
      closePopupOnClick={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      <ZoomControl position="bottomright" />
      <MapGestures />
      <MapInitialView />
      <MapBackgroundClick
        onClear={() => {
          if (skipMapClick.current) return
          clearBubble()
        }}
      />
      {bubble ? <QuakeDetailBubble bubble={bubble} onClose={clearBubble} /> : null}
      <MarkerClusterGroup
        chunkedLoading
        showCoverageOnHover={false}
        spiderfyOnMaxZoom
        zoomToBoundsOnClick={false}
        maxClusterRadius={55}
        disableClusteringAtZoom={9}
        iconCreateFunction={createClusterIcon}
        onClick={(event) => {
          L.DomEvent.stopPropagation(event.originalEvent)
          const cluster = (event.propagatedFrom ?? event.layer) as L.MarkerCluster
          if (!cluster?.getAllChildMarkers) return

          const children = cluster.getAllChildMarkers()
          let strongest: Earthquake | null = null
          for (const marker of children) {
            const id = markerQuakeId(marker)
            const quake = id ? earthquakes.find((item) => item.id === id) : undefined
            if (!quake) continue
            if (!strongest || (quake.magnitude ?? -Infinity) > (strongest.magnitude ?? -Infinity)) {
              strongest = quake
            }
          }
          if (!strongest) return

          const latlng = cluster.getLatLng()
          const note =
            children.length > 1 ? `${children.length} quakes in this group` : undefined
          showBubble(strongest, latlng.lat, latlng.lng, note)
        }}
      >
        {earthquakes.map((quake) => (
          <Marker
            key={quake.id}
            position={[quake.latitude, quake.longitude]}
            icon={createQuakeIcon(quake.magnitude, quake.id === selectedId, quake.id)}
            eventHandlers={{
              add: (event) => {
                markerQuakeIds.set(event.target, quake.id)
              },
              click: (event) => {
                L.DomEvent.stopPropagation(event.originalEvent)
                showBubble(quake, quake.latitude, quake.longitude)
              },
            }}
          />
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  )
}
