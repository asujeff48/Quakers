import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import type { Earthquake } from '../types'
import {
  formatDepthKm,
  formatMagnitude,
  formatPlace,
  formatQuakeTime,
  formatRelativeTime,
  magnitudeColor,
  magnitudeInk,
  sortQuakes,
  type QuakeSort,
} from '../usgs'

/** Below this width an in-flow column would squash the map, so the list becomes a drawer. */
const DRAWER_MAX_PX = 1100
const ROW_REM = 4.75
const OVERSCAN = 8

type Props = {
  earthquakes: Earthquake[]
  selectedId: string | null
  loading: boolean
  error: string | null
  onSelect: (id: string) => void
}

function useDrawer(): boolean {
  const query = `(max-width: ${DRAWER_MAX_PX}px)`
  const [drawer, setDrawer] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  )

  useEffect(() => {
    const media = window.matchMedia(query)
    const sync = () => setDrawer(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [query])

  return drawer
}

function useRowHeight(): number {
  const [height, setHeight] = useState(76)

  useEffect(() => {
    const read = () => {
      const root = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
      const next = (Number.isFinite(root) ? root : 16) * ROW_REM
      setHeight((current) => (current === next ? current : next))
    }
    read()
    window.addEventListener('resize', read)
    return () => window.removeEventListener('resize', read)
  }, [])

  return height
}

function compactCount(count: number): string {
  if (count < 1000) return String(count)
  const thousands = count / 1000
  const text =
    thousands >= 10 ? String(Math.round(thousands)) : thousands.toFixed(1).replace(/\.0$/, '')
  return `${text}k`
}

function quakeLabel(quake: Earthquake, now: number): string {
  const depth = formatDepthKm(quake.depthKm)
  const when = `${formatRelativeTime(quake.time, now)}, ${formatQuakeTime(quake.time)}`
  const base = `Magnitude ${formatMagnitude(quake.magnitude)}, ${formatPlace(quake.place)}, ${when}`
  return depth ? `${base}, depth ${depth}` : base
}

function QuakeRow({
  quake,
  index,
  total,
  selected,
  tabbable,
  now,
  onChoose,
  onFocusIndex,
  onKeyNav,
}: {
  quake: Earthquake
  index: number
  total: number
  selected: boolean
  tabbable: boolean
  now: number
  onChoose: (index: number) => void
  onFocusIndex: (index: number) => void
  onKeyNav: (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => void
}) {
  const depth = formatDepthKm(quake.depthKm)
  const relative = formatRelativeTime(quake.time, now)
  const absolute = formatQuakeTime(quake.time)
  const iso = new Date(quake.time).toISOString()

  return (
    <button
      type="button"
      className={selected ? 'quake-row is-selected' : 'quake-row'}
      data-quake-index={index}
      data-quake-id={quake.id}
      aria-pressed={selected}
      aria-setsize={total}
      aria-posinset={index + 1}
      aria-label={quakeLabel(quake, now)}
      tabIndex={tabbable ? 0 : -1}
      onClick={() => onChoose(index)}
      onFocus={() => onFocusIndex(index)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onChoose(index)
          return
        }
        onKeyNav(event, index)
      }}
    >
      <span
        className="quake-row-mag"
        style={{ background: magnitudeColor(quake.magnitude), color: magnitudeInk(quake.magnitude) }}
        aria-hidden="true"
      >
        {formatMagnitude(quake.magnitude)}
      </span>
      <span className="quake-row-copy">
        <span className="quake-row-place">{formatPlace(quake.place)}</span>
        <span className="quake-row-meta">
          <time dateTime={iso} title={absolute}>
            {relative}
          </time>
          {depth ? (
            <>
              <span aria-hidden="true"> · </span>
              depth {depth}
            </>
          ) : null}
        </span>
      </span>
    </button>
  )
}

export function QuakeList({ earthquakes, selectedId, loading, error, onSelect }: Props) {
  const drawer = useDrawer()
  const rowHeight = useRowHeight()
  const [open, setOpen] = useState(false)
  const [sort, setSort] = useState<QuakeSort>('newest')
  const [now, setNow] = useState(() => Date.now())
  const [scrollTop, setScrollTop] = useState(0)
  const [viewport, setViewport] = useState(0)
  const [focusIndex, setFocusIndex] = useState(0)

  const scrollerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const pendingFocus = useRef(false)
  const wasOpen = useRef(false)
  const focusIndexRef = useRef(0)

  const sorted = useMemo(() => sortQuakes(earthquakes, sort), [earthquakes, sort])
  const sortedRef = useRef(sorted)
  sortedRef.current = sorted
  const hasRows = sorted.length > 0

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!drawer) setOpen(false)
  }, [drawer])

  useEffect(() => {
    const el = scrollerRef.current
    if (el) el.scrollTop = 0
    setScrollTop(0)
    focusIndexRef.current = 0
    setFocusIndex(0)
  }, [earthquakes, sort])

  useEffect(() => {
    if (!selectedId) return
    const index = sortedRef.current.findIndex((quake) => quake.id === selectedId)
    if (index < 0) return
    focusIndexRef.current = index
    setFocusIndex(index)
    const el = scrollerRef.current
    if (!el) return
    const top = index * rowHeight
    const bottom = top + rowHeight
    if (top >= el.scrollTop && bottom <= el.scrollTop + el.clientHeight) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({
      top: Math.max(0, top - el.clientHeight / 2 + rowHeight / 2),
      behavior: reduce ? 'auto' : 'smooth',
    })
  }, [selectedId, rowHeight])

  useLayoutEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const measure = () => {
      const next = el.clientHeight
      setViewport((current) => (current === next ? current : next))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasRows, drawer, open])

  useLayoutEffect(() => {
    if (!pendingFocus.current) return
    const button = scrollerRef.current?.querySelector<HTMLButtonElement>(
      `[data-quake-index="${focusIndex}"]`,
    )
    if (!button) return
    pendingFocus.current = false
    button.focus({ preventScroll: true })
  }, [focusIndex, scrollTop, viewport, rowHeight, sorted])

  useEffect(() => {
    if (!drawer) {
      wasOpen.current = false
      return
    }
    if (open) {
      panelRef.current?.querySelector<HTMLButtonElement>('.quake-panel-close')?.focus()
    } else if (wasOpen.current) {
      toggleRef.current?.focus()
    }
    wasOpen.current = open
  }, [open, drawer])

  useEffect(() => {
    if (!open || !drawer) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        return
      }
      if (event.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusable = [
        ...panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]):not([tabindex="-1"]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
        ),
      ]
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, drawer])

  const windowHeight = viewport || rowHeight * 12
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN)
  const end = Math.min(sorted.length, Math.ceil((scrollTop + windowHeight) / rowHeight) + OVERSCAN)
  const indices: number[] = []
  for (let index = start; index < end; index += 1) indices.push(index)
  if (
    focusIndex >= 0 &&
    focusIndex < sorted.length &&
    (focusIndex < start || focusIndex >= end)
  ) {
    indices.push(focusIndex)
  }

  const moveFocus = (index: number) => {
    if (sorted.length === 0) return
    const clamped = Math.max(0, Math.min(sorted.length - 1, index))
    const el = scrollerRef.current
    if (el) {
      const top = clamped * rowHeight
      const bottom = top + rowHeight
      if (top < el.scrollTop) el.scrollTop = top
      else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight
      setScrollTop(el.scrollTop)
    }
    focusIndexRef.current = clamped
    setFocusIndex(clamped)
    pendingFocus.current = true
  }

  const choose = (index: number) => {
    const quake = sorted[index]
    if (!quake) return
    focusIndexRef.current = index
    setFocusIndex(index)
    if (drawer) setOpen(false)
    onSelect(quake.id)
  }

  const onFocusIndex = (index: number) => {
    focusIndexRef.current = index
    setFocusIndex((current) => (current === index ? current : index))
  }

  const onKeyNav = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    if (sorted.length === 0) return
    const page = Math.max(1, Math.floor((viewport || rowHeight) / rowHeight) - 1)
    const current = event.repeat ? focusIndexRef.current : index
    let next: number | null = null
    switch (event.key) {
      case 'ArrowDown':
        next = current + 1
        break
      case 'ArrowUp':
        next = current - 1
        break
      case 'PageDown':
        next = current + page
        break
      case 'PageUp':
        next = current - page
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = sorted.length - 1
        break
      default:
        return
    }
    event.preventDefault()
    moveFocus(next)
  }

  const countLabel = (() => {
    if (loading && earthquakes.length === 0) return 'Loading…'
    if (!loading && error && earthquakes.length === 0) return 'Update failed'
    const noun = earthquakes.length === 1 ? 'quake' : 'quakes'
    return `${earthquakes.length.toLocaleString()} ${noun}`
  })()

  const emptyMessage = loading
    ? 'Pulling USGS events…'
    : error
      ? error
      : 'No earthquakes reported in this time range.'

  return (
    <>
      {drawer && !open ? (
        <button
          ref={toggleRef}
          type="button"
          className="quake-panel-toggle"
          aria-expanded={false}
          aria-controls="recent-quakes"
          onClick={() => setOpen(true)}
        >
          Quakes
          {earthquakes.length > 0 ? (
            <span className="quake-panel-toggle-count">{compactCount(earthquakes.length)}</span>
          ) : null}
        </button>
      ) : null}
      {drawer && open ? (
        <button
          type="button"
          className="quake-panel-backdrop"
          aria-label="Close recent quakes"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <aside
        id="recent-quakes"
        ref={panelRef}
        className={
          drawer ? (open ? 'quake-panel is-drawer is-open' : 'quake-panel is-drawer') : 'quake-panel'
        }
        role={drawer ? 'dialog' : 'complementary'}
        aria-modal={drawer && open ? true : undefined}
        aria-labelledby="recent-quakes-title"
        aria-busy={loading}
        inert={drawer && !open ? true : undefined}
      >
        <div className="quake-panel-header">
          <div className="quake-panel-title-row">
            <div className="quake-panel-heading">
              <h2 id="recent-quakes-title">Recent quakes</h2>
              <p className="quake-panel-count">
                {countLabel}
                {loading && earthquakes.length > 0 ? (
                  <span className="quake-panel-updating"> · Updating…</span>
                ) : null}
              </p>
            </div>
            {drawer ? (
              <button
                type="button"
                className="quake-panel-close"
                aria-label="Close recent quakes"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            ) : null}
          </div>
          <div className="quake-sort" role="group" aria-label="Sort quakes">
            <button
              type="button"
              aria-pressed={sort === 'newest'}
              onClick={() => setSort('newest')}
            >
              Newest
            </button>
            <button
              type="button"
              aria-pressed={sort === 'magnitude'}
              onClick={() => setSort('magnitude')}
            >
              Magnitude
            </button>
          </div>
        </div>
        {hasRows ? (
          <div
            ref={scrollerRef}
            className="quake-panel-scroll"
            onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          >
            <ul
              className="quake-panel-list"
              aria-label={
                sort === 'newest'
                  ? 'Recent quakes, newest first'
                  : 'Recent quakes, strongest first'
              }
              style={{ height: sorted.length * rowHeight }}
            >
              {indices.map((index) => {
                const quake = sorted[index]
                if (!quake) return null
                return (
                  <li
                    key={quake.id}
                    className="quake-row-slot"
                    style={{ top: index * rowHeight, height: rowHeight }}
                  >
                    <QuakeRow
                      quake={quake}
                      index={index}
                      total={sorted.length}
                      selected={quake.id === selectedId}
                      tabbable={index === focusIndex}
                      now={now}
                      onChoose={choose}
                      onFocusIndex={onFocusIndex}
                      onKeyNav={onKeyNav}
                    />
                  </li>
                )
              })}
            </ul>
          </div>
        ) : (
          <p className={error && !loading ? 'quake-panel-message is-error' : 'quake-panel-message'}>
            {loading ? <span className="pulse-dot" aria-hidden="true" /> : null}
            {emptyMessage}
          </p>
        )}
      </aside>
    </>
  )
}
