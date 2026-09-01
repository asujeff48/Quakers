import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import L from 'leaflet'
import 'leaflet.markercluster'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents, ZoomControl } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import { cartoTileLayerUrl } from '../carto'
import type { Earthquake } from '../types'
import { formatMagnitude, formatPlace, formatQuakeTime, magnitudeColor, magnitudeRadius } from '../usgs'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'

const USA_CENTER: [number, number] = [39.5, -98.35]
const USA_ZOOM = 4
const ALASKA_CENTER: [number, number] = [64.2, -152.5]
const ALASKA_ZOOM = 4
const HAWAII_CENTER: [number, number] = [20.7, -157.2]
const HAWAII_ZOOM = 6
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
    let userMoved = false
    let applying = false

    const apply = () => {
      if (userMoved) return
      applying = true
      map.setView(shiftedLatLng(map, USA_CENTER, USA_ZOOM), USA_ZOOM, { animate: false })
      applying = false
    }

    const markMoved = () => {
      if (!applying) userMoved = true
    }

    const goHome = () => {
      userMoved = false
      apply()
    }

    apply()
    const frame = requestAnimationFrame(apply)
    window.addEventListener('resize', apply)
    map.on('dragstart zoomstart movestart', markMoved)
    map.on('quakers:home', goHome)

    const overlay = document.querySelector('.status-rail')
    if (!overlay) {
      return () => {
        cancelAnimationFrame(frame)
        window.removeEventListener('resize', apply)
        map.off('dragstart zoomstart movestart', markMoved)
        map.off('quakers:home', goHome)
      }
    }

    const observer = new ResizeObserver(apply)
    observer.observe(overlay)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', apply)
      map.off('dragstart zoomstart movestart', markMoved)
      map.off('quakers:home', goHome)
      observer.disconnect()
    }
  }, [map])

  return null
}

function addNavButton(
  parent: HTMLElement,
  className: string,
  label: string,
  aria: string,
  onClick: () => void,
) {
  const button = L.DomUtil.create('button', className, parent) as HTMLButtonElement
  button.type = 'button'
  button.textContent = label
  button.setAttribute('aria-label', aria)
  L.DomEvent.disableClickPropagation(button)
  L.DomEvent.on(button, 'click', onClick)
}

/** Arrow pad plus Alaska / Hawaii / Lower 48 jumps for mouse-only screens. */
function MapNavControl() {
  const map = useMap()

  useEffect(() => {
    const control = new L.Control({ position: 'bottomright' })

    control.onAdd = () => {
      const root = L.DomUtil.create('div', 'map-nav')
      const regions = L.DomUtil.create('div', 'map-nav-regions', root)
      const pad = L.DomUtil.create('div', 'map-nav-pad', root)

      addNavButton(regions, '', 'Lower 48', 'Show contiguous United States', () => {
        map.fire('quakers:home')
      })
      addNavButton(regions, '', 'Alaska', 'Show Alaska', () => {
        map.setView(ALASKA_CENTER, ALASKA_ZOOM)
      })
      addNavButton(regions, '', 'Hawaii', 'Show Hawaii', () => {
        map.setView(HAWAII_CENTER, HAWAII_ZOOM)
      })

      const pan = (x: number, y: number) => {
        const size = map.getSize()
        map.panBy([size.x * x, size.y * y], { animate: true, duration: 0.28 })
      }

      addNavButton(pad, 'map-nav-n', '↑', 'Pan north', () => pan(0, -0.42))
      addNavButton(pad, 'map-nav-w', '←', 'Pan west', () => pan(-0.42, 0))
      addNavButton(pad, 'map-nav-e', '→', 'Pan east', () => pan(0.42, 0))
      addNavButton(pad, 'map-nav-s', '↓', 'Pan south', () => pan(0, 0.42))

      L.DomEvent.disableClickPropagation(root)
      L.DomEvent.disableScrollPropagation(root)
      return root
    }

    control.addTo(map)
    return () => {
      control.remove()
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
      'Earthquake map. Click and drag to pan, or use the arrows and Alaska / Hawaii buttons. Click a quake for details.',
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
  return formatPlace(quake.place)
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

function quakeFromMarker(marker: L.Marker, earthquakes: Earthquake[]): Earthquake | undefined {
  const id = markerQuakeId(marker)
  if (id) {
    const match = earthquakes.find((item) => item.id === id)
    if (match) return match
  }
  const ll = marker.getLatLng()
  return earthquakes.find(
    (item) => Math.abs(item.latitude - ll.lat) < 1e-5 && Math.abs(item.longitude - ll.lng) < 1e-5,
  )
}

function clusterFromEvent(event: L.LeafletMouseEvent): L.MarkerCluster | null {
  const candidates = [event.layer, event.propagatedFrom, event.target]
  for (const layer of candidates) {
    if (typeof (layer as L.MarkerCluster | undefined)?.getAllChildMarkers === 'function') {
      return layer as L.MarkerCluster
    }
  }
  return null
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
        url={cartoTileLayerUrl()}
      />
      <MapNavControl />
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
          const cluster = clusterFromEvent(event)
          if (!cluster) return

          const children = cluster.getAllChildMarkers()
          let strongest: Earthquake | null = null
          for (const marker of children) {
            const quake = quakeFromMarker(marker, earthquakes)
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
