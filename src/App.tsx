import { useEffect, useState, type CSSProperties } from 'react'
import { EarthquakeMap } from './components/EarthquakeMap'
import {
  DEFAULT_TIMEFRAME,
  TIMEFRAMES,
  type Earthquake,
  type TimeframeId,
} from './types'
import {
  fetchUsaEarthquakes,
  formatMagnitude,
  formatPlace,
  formatQuakeTime,
  magnitudeColor,
} from './usgs'
import './App.css'

export default function App() {
  const [timeframe, setTimeframe] = useState<TimeframeId>(DEFAULT_TIMEFRAME)
  const [earthquakes, setEarthquakes] = useState<Earthquake[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setSelectedId(null)

    fetchUsaEarthquakes(timeframe, controller.signal)
      .then((result) => {
        setEarthquakes(result.earthquakes)
        setFetchedAt(result.fetchedAt)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        const message = err instanceof Error ? err.message : 'Unable to load earthquakes'
        setError(message)
        setEarthquakes([])
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [timeframe])

  const strongest = earthquakes.reduce<Earthquake | null>((best, quake) => {
    if (quake.magnitude === null) return best
    if (!best || (best.magnitude ?? -Infinity) < quake.magnitude) return quake
    return best
  }, null)
  const strongestLocation = strongest ? formatPlace(strongest.place) : null

  const activeLabel =
    TIMEFRAMES.find((option) => option.id === timeframe)?.label ?? 'Last 24 hours'

  return (
    <div className="app">
      <div className="map-stage" aria-hidden={false}>
        <EarthquakeMap
          earthquakes={earthquakes}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <div className="map-veil" />
      </div>

      <header className="chrome">
        <div className="brand-block">
          <p className="brand">Quakers</p>
          <h1>Reported earthquakes across the United States</h1>
          <p className="lede">
            Live USGS catalog for the {activeLabel.toLowerCase()}. Click or tap any quake or cluster
            for location, time, and magnitude. Pinch or use zoom buttons to look closer.
          </p>
        </div>

        <div className="controls" role="group" aria-label="Timeframe">
          {TIMEFRAMES.map((option) => (
            <button
              key={option.id}
              type="button"
              className={option.id === timeframe ? 'is-active' : undefined}
              aria-pressed={option.id === timeframe}
              onClick={() => setTimeframe(option.id)}
            >
              {option.shortLabel}
            </button>
          ))}
        </div>
      </header>

      <aside className="status-rail" aria-live="polite">
        {loading ? (
          <p className="status loading">
            <span className="pulse-dot" />
            Pulling USGS events…
          </p>
        ) : error ? (
          <p className="status error">{error}</p>
        ) : (
          <div className="status-block">
            <p className="status">
              <strong>{earthquakes.length.toLocaleString()}</strong> quakes
              {strongest ? (
                <>
                  {' '}
                  · strongest <strong>M {formatMagnitude(strongest.magnitude)}</strong>
                </>
              ) : null}
              {fetchedAt ? (
                <span className="fetched">
                  {' '}
                  · updated {formatQuakeTime(fetchedAt)}
                </span>
              ) : null}
            </p>
            {strongest && strongestLocation ? (
              <p className="status-strongest">
                <span className="status-strongest-mag">
                  M {formatMagnitude(strongest.magnitude)}
                </span>
                <span className="status-strongest-sep" aria-hidden="true">
                  ·
                </span>
                <span className="status-strongest-place">{strongestLocation}</span>
                <span className="status-strongest-sep" aria-hidden="true">
                  ·
                </span>
                <time dateTime={new Date(strongest.time).toISOString()}>
                  {formatQuakeTime(strongest.time)}
                </time>
              </p>
            ) : null}
          </div>
        )}
      </aside>

      <div className="legend-stack">
      <div className="legend legend-clusters" aria-label="Numbered cluster legend">
        <span
          className="quake-cluster legend-cluster-demo"
          style={{ '--cluster-color': magnitudeColor(1.5) } as CSSProperties}
          aria-hidden="true"
        >
          <strong>12</strong>
          <em>max M2.1</em>
        </span>
        <p className="legend-cluster-copy">
          Numbered circles group nearby quakes for the {activeLabel.toLowerCase()}. The large
          number is the count; max M is the strongest.
        </p>
      </div>
      <div className="legend" aria-label="Magnitude color legend">
        <span className="legend-item">
          <span className="swatch" style={{ background: magnitudeColor(1.5) }} />
          1–2.9
        </span>
        <span className="legend-item">
          <span className="swatch" style={{ background: magnitudeColor(3.5) }} />
          3
        </span>
        <span className="legend-item">
          <span className="swatch" style={{ background: magnitudeColor(4.5) }} />
          4
        </span>
        <span className="legend-item">
          <span className="swatch" style={{ background: magnitudeColor(5.5) }} />
          5
        </span>
        <span className="legend-item">
          <span className="swatch" style={{ background: magnitudeColor(6.5) }} />
          6
        </span>
        <span className="legend-item">
          <span className="swatch" style={{ background: magnitudeColor(7.5) }} />
          7
        </span>
        <span className="legend-item">
          <span className="swatch" style={{ background: magnitudeColor(8.5) }} />
          8
        </span>
        <span className="legend-item">
          <span className="swatch" style={{ background: magnitudeColor(9.5) }} />
          9+
        </span>
      </div>
      </div>

      <footer className="credit">
        Data from the{' '}
        <a href="https://earthquake.usgs.gov/" target="_blank" rel="noreferrer">
          U.S. Geological Survey
        </a>
      </footer>
    </div>
  )
}
