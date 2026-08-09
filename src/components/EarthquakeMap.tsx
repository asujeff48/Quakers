import { useEffect } from 'react'
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet'
import type { Earthquake } from '../types'
import { formatMagnitude, formatQuakeTime, magnitudeColor, magnitudeRadius } from '../usgs'
import 'leaflet/dist/leaflet.css'

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
    map.flyTo([selected.latitude, selected.longitude], Math.max(map.getZoom(), 6), {
      duration: 0.85,
    })
  }, [map, selected])

  return null
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
      {earthquakes.map((quake) => {
        const isSelected = quake.id === selectedId
        const color = magnitudeColor(quake.magnitude)
        const radius = magnitudeRadius(quake.magnitude) + (isSelected ? 3 : 0)

        return (
          <CircleMarker
            key={quake.id}
            center={[quake.latitude, quake.longitude]}
            radius={radius}
            pathOptions={{
              color: isSelected ? '#0d3b4c' : color,
              weight: isSelected ? 3 : 1.25,
              fillColor: color,
              fillOpacity: isSelected ? 0.95 : 0.72,
              className: isSelected ? 'quake-marker is-selected' : 'quake-marker',
            }}
            eventHandlers={{
              click: () => onSelect(quake.id),
            }}
          >
            <Popup>
              <div className="quake-popup">
                <strong>M {formatMagnitude(quake.magnitude)}</strong>
                <p>{quake.place}</p>
                <time dateTime={new Date(quake.time).toISOString()}>
                  {formatQuakeTime(quake.time)}
                </time>
              </div>
            </Popup>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}
