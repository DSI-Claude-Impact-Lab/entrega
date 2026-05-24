import { useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import {
  APIProvider,
  Map as GMap,
  AdvancedMarker,
  useMap,
} from '@vis.gl/react-google-maps'
import { GoogleMapsOverlay } from '@deck.gl/google-maps'
import { HeatmapLayer } from '@deck.gl/aggregation-layers'

import {
  api,
  type AreaFM,
  type AreaReport,
  type Camera,
  type Facilitator,
  type HeatFilter,
  type HeatPoint,
  type OrcrimPolygon,
  type RouteWaypoint,
  type UrbanFactor,
} from '../lib/api'
import { FloatingChat } from './FloatingChat'
import { setChatContext } from '../lib/chatStore'

const API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '').toString()
const MAP_ID =
  (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID ?? '').toString() || 'CompStatRioMap'
const RIO_CENTER = { lat: -22.92, lng: -43.35 }

const HEAT_MAX_POINTS = 20000
const HEAT_BIN_PRECISION = 3

const FACTION_COLORS: Record<string, string> = {
  CV: '#DC2626',
  'Milícia': '#3B82F6',
  Milicia: '#3B82F6',
  TCP: '#10B981',
  ADA: '#F59E0B',
}

const FACTION_RGBA: Record<string, [number, number, number, number]> = {
  CV: [220, 38, 38, 70],
  'Milícia': [59, 130, 246, 70],
  Milicia: [59, 130, 246, 70],
  TCP: [16, 185, 129, 70],
  ADA: [245, 158, 11, 70],
}

const HEAT_COLORS: [number, number, number][] = [
  [59, 7, 100],
  [126, 34, 206],
  [220, 38, 38],
  [251, 146, 60],
  [254, 240, 138],
]

const DENUNCIA_HEAT_COLORS: [number, number, number][] = [
  [236, 72, 153],
  [244, 63, 94],
  [249, 115, 22],
  [250, 204, 21],
  [255, 255, 255],
]

const URBAN_FACTOR_COLORS: Record<string, string> = {
  iluminacao: '#FBBF24',
  vegetacao: '#10B981',
  retencao_trafego: '#F59E0B',
  mobiliario: '#8B5CF6',
  comercio_irregular: '#FF6B35',
  visibilidade: '#06B6D4',
  desordem_urbana: '#DC2626',
  outro: '#C9CFD8',
}

const DARK_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#0F1419' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8B95A7' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0A0E14' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#C9CFD8' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#5A6478' }],
  },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#151B23' }] },
  {
    featureType: 'road',
    elementType: 'geometry.fill',
    stylers: [{ color: '#1A2230' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#222C3C' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#8B95A7' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.fill',
    stylers: [{ color: '#252F3F' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#FF6B35' }, { weight: 0.3 }],
  },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#151B23' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#070B11' }] },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#3B82F6' }],
  },
]

const DELITO_OPTIONS: { value: NonNullable<HeatFilter['delito']>; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'transeunte', label: 'Transeunte' },
  { value: 'celular', label: 'Celular' },
  { value: 'coletivo', label: 'Coletivo' },
]

const YEAR_OPTIONS = [2020, 2021, 2022, 2023, 2024]

const HOUR_PRESETS: { label: string; range: [number, number] | null }[] = [
  { label: 'Todas', range: null },
  { label: 'Madrugada · 0-5h', range: [0, 5] },
  { label: 'Manhã · 6-11h', range: [6, 11] },
  { label: 'Tarde · 12-17h', range: [12, 17] },
  { label: 'Noite · 18-23h', range: [18, 23] },
  { label: 'Pico · 19-22h', range: [19, 22] },
]

type LoadState = 'idle' | 'loading' | 'ready' | 'error'
type RoutePickMode = 'start' | 'end' | null

function CameraGlyph({ size = 13 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
      <circle cx={12} cy={13} r={3} />
    </svg>
  )
}

function scoreColor(score: number): string {
  if (score >= 0.85) return '#DC2626'
  if (score >= 0.65) return '#EA580C'
  if (score >= 0.45) return '#F59E0B'
  if (score >= 0.25) return '#FBBF24'
  return '#84CC16'
}

function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace('#', '')
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ]
}

export function MapView() {
  if (!API_KEY) {
    return (
      <div className="m-4 rounded border border-bg-4 bg-bg-2 p-5">
        <div className="font-mono mb-1 text-[9.5px] uppercase tracking-widest text-ink-3">
          Configuração
        </div>
        <div className="text-sm text-ink-1">
          Defina <code className="text-accent-orange">VITE_GOOGLE_MAPS_API_KEY</code> em{' '}
          <code className="text-accent-orange">frontend/.env</code> e reinicie{' '}
          <code className="text-accent-orange">npm run dev</code>.
        </div>
      </div>
    )
  }

  return (
    <APIProvider apiKey={API_KEY}>
      <MapShell />
    </APIProvider>
  )
}

function MapShell() {
  const [showCameras, setShowCameras] = useState(false)
  const [showOrcrim, setShowOrcrim] = useState(false)
  const [showHeatmap, setShowHeatmap] = useState(true)
  const [showAreasFm, setShowAreasFm] = useState(true)
  const [showUrbanFactors, setShowUrbanFactors] = useState(false)
  const [showFacilitators, setShowFacilitators] = useState(false)
  const [showDenuncias, setShowDenuncias] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
  const [filter, setFilter] = useState<HeatFilter>({
    delito: 'all',
    max_points: HEAT_MAX_POINTS,
    bin_precision: HEAT_BIN_PRECISION,
  })

  const [heat, setHeat] = useState<HeatPoint[]>([])

  const [cameras, setCameras] = useState<Camera[]>([])
  const [camerasState, setCamerasState] = useState<LoadState>('idle')

  const [orcrim, setOrcrim] = useState<OrcrimPolygon[]>([])
  const [orcrimState, setOrcrimState] = useState<LoadState>('idle')

  const [areasFm, setAreasFm] = useState<AreaFM[]>([])
  const [areasState, setAreasState] = useState<LoadState>('idle')

  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null)
  const [report, setReport] = useState<AreaReport | null>(null)
  const [reportState, setReportState] = useState<LoadState>('idle')

  const [urbanFactors, setUrbanFactors] = useState<UrbanFactor[]>([])
  const [urbanFactorsState, setUrbanFactorsState] = useState<LoadState>('idle')

  const [facilitators, setFacilitators] = useState<Facilitator[]>([])
  const [facilitatorsState, setFacilitatorsState] = useState<LoadState>('idle')

  const [denunciasHeat, setDenunciasHeat] = useState<HeatPoint[]>([])
  const [, setDenunciasState] = useState<LoadState>('idle')
  const [denunciasTotal, setDenunciasTotal] = useState(0)

  const [routeStart, setRouteStart] = useState<google.maps.LatLngLiteral | null>(null)
  const [routeEnd, setRouteEnd] = useState<google.maps.LatLngLiteral | null>(null)
  const [routePickMode, setRoutePickMode] = useState<RoutePickMode>(null)
  const [routeWaypoints, setRouteWaypoints] = useState<RouteWaypoint[]>([])
  const [routeState, setRouteState] = useState<LoadState>('idle')
  const [routeError, setRouteError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .heat(filter)
      .then((res) => {
        if (cancelled) return
        setHeat(res.items)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [filter])

  // Publish current map context to the chat store so any chat surface
  // (floating widget, page) sends the same context payload to the LLM.
  useEffect(() => {
    const selectedArea = selectedAreaId
      ? areasFm.find((a) => a.id === selectedAreaId)
      : null
    const reportDigest = report
      ? {
          id: report.id,
          name: report.name,
          total_ocorrencias: report.total_ocorrencias,
          delta_pct: report.delta_pct,
          last_month: report.last_month,
          previous_month: report.previous_month,
          peak_hour: report.peak_hour,
          dia_pico: report.dia_pico,
          n_fatores_total: report.n_fatores_total,
          dinamica: report.dinamica,
          top_delitos: report.top_delitos?.slice(0, 5),
          top_logradouros: report.top_logradouros?.slice(0, 8),
          fatores_ranking: report.fatores_ranking?.slice(0, 8),
          bingos: report.bingos?.slice(0, 6),
        }
      : null
    const camerasByArea: Record<string, number> = {}
    for (const c of cameras) {
      const k = c.area || '—'
      camerasByArea[k] = (camerasByArea[k] ?? 0) + 1
    }
    const camerasTopAreas = Object.entries(camerasByArea)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([area, n]) => ({ area, n }))

    const orcrimByFaction: Record<string, number> = {}
    for (const p of orcrim) {
      const k = p.faction || '—'
      orcrimByFaction[k] = (orcrimByFaction[k] ?? 0) + 1
    }

    const factorsByOrgao: Record<string, number> = {}
    const factorsByType: Record<string, number> = {}
    for (const f of urbanFactors) {
      factorsByOrgao[f.agency || '—'] = (factorsByOrgao[f.agency || '—'] ?? 0) + 1
      factorsByType[f.type || '—'] = (factorsByType[f.type || '—'] ?? 0) + 1
    }
    const factorsTopOrgao = Object.entries(factorsByOrgao)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([orgao, n]) => ({ orgao, n }))
    const factorsTopType = Object.entries(factorsByType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tipo, n]) => ({ tipo, n }))

    const denunciaMaxWeight = denunciasHeat.reduce(
      (m, p) => (p.weight > m ? p.weight : m),
      0,
    )

    setChatContext({
      application: 'Hórus — CompStat Rio',
      view: 'mapa',
      filters: {
        delito: filter.delito ?? 'all',
        year: filter.year ?? null,
      },
      layers_visible: {
        heatmap: showHeatmap,
        areas_fm: showAreasFm,
        cameras: showCameras,
        orcrim: showOrcrim,
        urban_factors: showUrbanFactors,
        denuncias: showDenuncias,
      },
      counts: {
        heat_bins: heat.length,
        areas_fm: areasFm.length,
        cameras: cameras.length,
        orcrim_polygons: orcrim.length,
        urban_factors: urbanFactors.length,
        denuncia_bins: denunciasHeat.length,
        denuncia_total: denunciasTotal,
      },
      cameras_summary: {
        total: cameras.length,
        top_areas: camerasTopAreas,
      },
      orcrim_summary: {
        total: orcrim.length,
        by_faction: orcrimByFaction,
        sample: orcrim.slice(0, 12).map((p) => ({
          name: p.name,
          faction: p.faction,
        })),
      },
      urban_factors_summary: {
        total: urbanFactors.length,
        by_orgao: factorsTopOrgao,
        by_type: factorsTopType,
      },
      denuncias_summary: {
        total: denunciasTotal,
        bins: denunciasHeat.length,
        max_weight: denunciaMaxWeight,
      },
      selected_area: selectedArea
        ? {
            id: selectedArea.id,
            name: selectedArea.name,
            score: selectedArea.score,
            n_ocorrencias: selectedArea.n_ocorrencias,
          }
        : null,
      area_report: reportDigest,
      areas_fm_summary: areasFm
        .slice(0, 8)
        .map((a) => ({
          name: a.name,
          score: Number(a.score.toFixed(3)),
          n_ocorrencias: a.n_ocorrencias,
        })),
    })
  }, [
    filter,
    showHeatmap,
    showAreasFm,
    showCameras,
    showOrcrim,
    showUrbanFactors,
    showDenuncias,
    heat.length,
    areasFm,
    cameras,
    orcrim,
    urbanFactors,
    denunciasHeat,
    denunciasTotal,
    selectedAreaId,
    report,
  ])

  // All datasets load on mount regardless of layer visibility — the toggles
  // only control rendering. We always need the data in the chat context.
  useEffect(() => {
    if (camerasState !== 'idle') return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCamerasState('loading')
    api
      .cameras()
      .then((res) => {
        setCameras(res.items)
        setCamerasState('ready')
      })
      .catch(() => setCamerasState('error'))
  }, [camerasState])

  useEffect(() => {
    if (orcrimState !== 'idle') return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrcrimState('loading')
    api
      .orcrim()
      .then((res) => {
        setOrcrim(res.items)
        setOrcrimState('ready')
      })
      .catch(() => setOrcrimState('error'))
  }, [orcrimState])

  useEffect(() => {
    if (urbanFactorsState !== 'idle') return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrbanFactorsState('loading')
    api
      .urbanFactors()
      .then((res) => {
        setUrbanFactors(res.items)
        setUrbanFactorsState('ready')
      })
      .catch(() => setUrbanFactorsState('error'))
  }, [showUrbanFactors, urbanFactorsState])

  useEffect(() => {
    if (!showFacilitators || facilitatorsState !== 'idle') return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFacilitatorsState('loading')
    api
      .facilitators()
      .then((res) => {
        setFacilitators(res.items)
        setFacilitatorsState('ready')
      })
      .catch(() => setFacilitatorsState('error'))
  }, [showFacilitators, facilitatorsState])

  useEffect(() => {
    if (!showDenuncias) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDenunciasState('loading')
    api
      .denunciasHeat({
        max_points: 12000,
        bin_precision: HEAT_BIN_PRECISION,
        hour_min: filter.hour_min,
        hour_max: filter.hour_max,
      })
      .then((res) => {
        if (cancelled) return
        setDenunciasHeat(res.items)
        setDenunciasTotal(res.count)
        setDenunciasState('ready')
      })
      .catch(() => {
        if (cancelled) return
        setDenunciasState('error')
      })
    return () => {
      cancelled = true
    }
  }, [showDenuncias, filter.hour_min, filter.hour_max])

  useEffect(() => {
    if (!routeStart || !routeEnd) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRouteWaypoints([])
      setRouteState('idle')
      setRouteError(null)
      return
    }
    let cancelled = false
    setRouteState('loading')
    setRouteError(null)
    api
      .routeWaypoints({ start: routeStart, end: routeEnd, limit: 8, corridorM: 400 })
      .then((res) => {
        if (cancelled) return
        setRouteWaypoints(res.items)
        setRouteState('ready')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setRouteWaypoints([])
        setRouteState('error')
        setRouteError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [routeEnd, routeStart])

  // Areas FM — always load (they are the primary interactive layer)
  useEffect(() => {
    if (areasState !== 'idle') return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAreasState('loading')
    api
      .areasFm()
      .then((res) => {
        setAreasFm(res.items)
        setAreasState('ready')
      })
      .catch(() => setAreasState('error'))
  }, [areasState])

  // Load report on selection
  useEffect(() => {
    if (!selectedAreaId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReport(null)
      return
    }
    let cancelled = false
    setReportState('loading')
    api
      .areaReport(selectedAreaId)
      .then((r) => {
        if (cancelled) return
        setReport(r)
        setReportState('ready')
      })
      .catch(() => {
        if (cancelled) return
        setReportState('error')
      })
    return () => {
      cancelled = true
    }
  }, [selectedAreaId])

  const selectedArea = useMemo(
    () => (selectedAreaId ? areasFm.find((a) => a.id === selectedAreaId) ?? null : null),
    [selectedAreaId, areasFm],
  )

  type Detail =
    | { kind: 'urban_factor'; value: UrbanFactor }
    | { kind: 'facilitator'; value: Facilitator }
  const [selectedDetail, setSelectedDetail] = useState<Detail | null>(null)

  function selectArea(id: string) {
    setSelectedDetail(null)
    setSelectedAreaId(id)
  }
  function selectDetail(detail: Detail) {
    setSelectedAreaId(null)
    setSelectedDetail(detail)
  }

  const hasRightPanel = !!selectedArea || !!selectedDetail
  const gridCols = panelOpen
    ? hasRightPanel
      ? 'lg:grid-cols-[220px_1fr_340px]'
      : 'lg:grid-cols-[220px_1fr]'
    : hasRightPanel
      ? 'lg:grid-cols-[1fr_340px]'
      : 'grid-cols-1'

  const setRoutePoint = (latLng: google.maps.LatLngLiteral) => {
    if (!routePickMode || !latLng) return
    if (routePickMode === 'start') {
      setRouteStart(latLng)
      setRoutePickMode(routeEnd ? null : 'end')
      return
    }
    setRouteEnd(latLng)
    setRoutePickMode(null)
  }

  const handleRouteMapClick = (event: {
    detail?: { latLng?: google.maps.LatLngLiteral | null }
  }) => {
    const latLng = event.detail?.latLng
    if (latLng) setRoutePoint(latLng)
  }

  const clearRoute = () => {
    setRouteStart(null)
    setRouteEnd(null)
    setRoutePickMode(null)
    setRouteWaypoints([])
    setRouteState('idle')
    setRouteError(null)
  }

  return (
    <div className={`absolute inset-x-0 top-12 bottom-0 grid grid-cols-1 ${gridCols}`}>
      {panelOpen ? (
        <SidePanel
          onClose={() => setPanelOpen(false)}
          showCameras={showCameras}
          setShowCameras={setShowCameras}
          showOrcrim={showOrcrim}
          setShowOrcrim={setShowOrcrim}
          showHeatmap={showHeatmap}
          setShowHeatmap={setShowHeatmap}
          showAreasFm={showAreasFm}
          setShowAreasFm={setShowAreasFm}
          showUrbanFactors={showUrbanFactors}
          setShowUrbanFactors={setShowUrbanFactors}
          showFacilitators={showFacilitators}
          setShowFacilitators={setShowFacilitators}
          showDenuncias={showDenuncias}
          setShowDenuncias={setShowDenuncias}
          filter={filter}
          setFilter={setFilter}
          routeStart={routeStart}
          routeEnd={routeEnd}
          routePickMode={routePickMode}
          routeWaypointsCount={routeWaypoints.length}
          routeState={routeState}
          routeError={routeError}
          setRoutePickMode={setRoutePickMode}
          onClearRoute={clearRoute}
        />
      ) : null}

      <div className="relative">
        {!panelOpen ? (
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="font-mono absolute left-3 top-3 z-20 flex items-center gap-1.5 rounded border border-bg-4 bg-bg-1/95 px-2.5 py-1.5 text-[10.5px] uppercase tracking-wider text-ink-1 backdrop-blur transition hover:bg-bg-2"
            aria-label="Abrir filtros"
          >
            <PanelLeftOpen className="size-3.5 text-accent-orange" />
            Filtros
          </button>
        ) : null}
        <GMap
          mapId={MAP_ID}
          defaultCenter={RIO_CENTER}
          defaultZoom={11}
          gestureHandling="greedy"
          disableDefaultUI={false}
          styles={DARK_MAP_STYLE}
          colorScheme="DARK"
          className="size-full"
          onClick={handleRouteMapClick}
        >
          {showHeatmap && (
            <DeckHeatmapLayer id="crime-heatmap" points={heat} colors={HEAT_COLORS} />
          )}
          {showDenuncias && (
            <DeckHeatmapLayer
              id="denuncias-heatmap"
              points={denunciasHeat}
              colors={DENUNCIA_HEAT_COLORS}
              radiusPixels={28}
              intensity={1.2}
            />
          )}
          {showOrcrim && <OrcrimLayer polygons={orcrim} />}
          {showOrcrim &&
            orcrim.map((poly, i) => {
              const c = polygonCentroid(poly.ring)
              if (!c) return null
              const color = FACTION_COLORS[poly.faction] ?? '#8B95A7'
              return (
                <AdvancedMarker
                  key={`label-${poly.name}-${i}`}
                  position={c}
                  title={poly.name}
                >
                  <div className="orcrim-label" style={{ color }}>
                    {poly.faction}
                  </div>
                </AdvancedMarker>
              )
            })}
          {showAreasFm && (
            <AreasFmLayer
              areas={areasFm}
              selectedId={selectedAreaId}
              onSelect={selectArea}
              routePickMode={routePickMode}
              onRoutePoint={setRoutePoint}
            />
          )}
          {showCameras &&
            cameras.map((c) => (
              <AdvancedMarker
                key={c.id}
                position={{ lat: c.lat, lng: c.lng }}
                title={c.area || 'Câmera FM'}
              >
                <div className="compstat-camera-marker">
                  <CameraGlyph />
                </div>
              </AdvancedMarker>
            ))}
          {showUrbanFactors && (
            <UrbanFactorsLayer
              factors={urbanFactors}
              onSelect={(value) => selectDetail({ kind: 'urban_factor', value })}
            />
          )}
          {showFacilitators && (
            <FacilitatorsLayer
              facilitators={facilitators}
              onSelect={(value) => selectDetail({ kind: 'facilitator', value })}
            />
          )}
          {routeStart && routeEnd && (
            <RouteLayer start={routeStart} end={routeEnd} waypoints={routeWaypoints} />
          )}
          {routeStart && <RouteEndpointMarker point={routeStart} label="I" />}
          {routeEnd && <RouteEndpointMarker point={routeEnd} label="F" />}
          {routeWaypoints.map((waypoint, index) => (
            <AdvancedMarker
              key={`route-waypoint-${waypoint.id}`}
              position={{ lat: waypoint.lat, lng: waypoint.lng }}
              title={waypoint.crime_type || 'Ocorrência'}
            >
              <div className="compstat-route-waypoint">{index + 1}</div>
            </AdvancedMarker>
          ))}
        </GMap>
        {showHeatmap && <HeatmapLegend />}
        <FloatingChat />
      </div>

      {selectedArea ? (
        <AreaReportPanel
          area={selectedArea}
          report={report}
          state={reportState}
          onClose={() => setSelectedAreaId(null)}
        />
      ) : selectedDetail ? (
        <DetailPanel detail={selectedDetail} onClose={() => setSelectedDetail(null)} />
      ) : null}
    </div>
  )
}

function polygonCentroid(ring: [number, number][]): { lat: number; lng: number } | null {
  if (ring.length === 0) return null
  let lat = 0
  let lng = 0
  for (const [la, lo] of ring) {
    lat += la
    lng += lo
  }
  return { lat: lat / ring.length, lng: lng / ring.length }
}

function SidePanel({
  onClose,
  showCameras,
  setShowCameras,
  showOrcrim,
  setShowOrcrim,
  showHeatmap,
  setShowHeatmap,
  showAreasFm,
  setShowAreasFm,
  showUrbanFactors,
  setShowUrbanFactors,
  showFacilitators,
  setShowFacilitators,
  showDenuncias,
  setShowDenuncias,
  filter,
  setFilter,
  routeStart,
  routeEnd,
  routePickMode,
  routeWaypointsCount,
  routeState,
  routeError,
  setRoutePickMode,
  onClearRoute,
}: {
  onClose: () => void
  showCameras: boolean
  setShowCameras: (v: boolean) => void
  showOrcrim: boolean
  setShowOrcrim: (v: boolean) => void
  showHeatmap: boolean
  setShowHeatmap: (v: boolean) => void
  showAreasFm: boolean
  setShowAreasFm: (v: boolean) => void
  showUrbanFactors: boolean
  setShowUrbanFactors: (v: boolean) => void
  showFacilitators: boolean
  setShowFacilitators: (v: boolean) => void
  showDenuncias: boolean
  setShowDenuncias: (v: boolean) => void
  filter: HeatFilter
  setFilter: Dispatch<SetStateAction<HeatFilter>>
  routeStart: google.maps.LatLngLiteral | null
  routeEnd: google.maps.LatLngLiteral | null
  routePickMode: RoutePickMode
  routeWaypointsCount: number
  routeState: LoadState
  routeError: string | null
  setRoutePickMode: (mode: RoutePickMode) => void
  onClearRoute: () => void
}) {
  return (
    <aside className="scrollbar overflow-y-auto border-r border-bg-4 bg-bg-1/95 px-3 py-3 backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <SectionLabel>FILTRO · CRIME</SectionLabel>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-ink-3 hover:bg-bg-2 hover:text-ink-1"
          aria-label="Recolher filtros"
        >
          <PanelLeftClose className="size-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {DELITO_OPTIONS.map((opt) => (
          <PillButton
            key={opt.value}
            active={filter.delito === opt.value}
            onClick={() => setFilter((f) => ({ ...f, delito: opt.value }))}
          >
            {opt.label}
          </PillButton>
        ))}
      </div>

      <div className="my-4 h-px bg-bg-4" />
      <SectionLabel>FILTRO · ANO</SectionLabel>
      <div className="flex flex-wrap gap-1.5">
        <PillButton
          active={filter.year == null}
          onClick={() => setFilter((f) => ({ ...f, year: undefined }))}
        >
          Todos
        </PillButton>
        {YEAR_OPTIONS.map((y) => (
          <PillButton
            key={y}
            active={filter.year === y}
            onClick={() => setFilter((f) => ({ ...f, year: y }))}
          >
            {y}
          </PillButton>
        ))}
      </div>

      <div className="my-4 h-px bg-bg-4" />
      <SectionLabel>FILTRO · HORÁRIO</SectionLabel>
      <div className="flex flex-wrap gap-1.5">
        {HOUR_PRESETS.map((p) => (
          <PillButton
            key={p.label}
            active={
              p.range == null
                ? filter.hour_min == null && filter.hour_max == null
                : filter.hour_min === p.range[0] && filter.hour_max === p.range[1]
            }
            onClick={() => {
              const lo = p.range == null ? undefined : p.range[0]
              const hi = p.range == null ? undefined : p.range[1]
              setFilter((f) => ({ ...f, hour_min: lo, hour_max: hi }))
            }}
          >
            {p.label}
          </PillButton>
        ))}
      </div>

      <div className="my-4 h-px bg-bg-4" />
      <SectionLabel>Rota</SectionLabel>
      <div className="space-y-1.5">
        <div className="grid grid-cols-2 gap-1.5">
          <PillButton
            active={routePickMode === 'start'}
            onClick={() => setRoutePickMode(routePickMode === 'start' ? null : 'start')}
          >
            Início
          </PillButton>
          <PillButton
            active={routePickMode === 'end'}
            onClick={() => setRoutePickMode(routePickMode === 'end' ? null : 'end')}
          >
            Fim
          </PillButton>
        </div>
        <div className="rounded border border-bg-4 bg-bg-2 px-2.5 py-2 text-[11px] leading-5 text-ink-2">
          <div className="flex justify-between gap-2">
            <span>Início</span>
            <span className="font-mono text-[9.5px] uppercase tracking-wider text-ink-3">
              {routeStart ? 'definido' : 'pendente'}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span>Fim</span>
            <span className="font-mono text-[9.5px] uppercase tracking-wider text-ink-3">
              {routeEnd ? 'definido' : 'pendente'}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span>Ocorrências</span>
            <span className="num-mono text-ink-1">
              {routeState === 'loading' ? '...' : routeWaypointsCount.toLocaleString('pt-BR')}
            </span>
          </div>
          {routeState === 'error' ? (
            <div className="mt-1 truncate text-accent-red" title={routeError ?? undefined}>
              Erro na rota
            </div>
          ) : null}
        </div>
        <PillButton active={false} onClick={onClearRoute}>
          Limpar
        </PillButton>
      </div>

      <div className="my-4 h-px bg-bg-4" />
      <SectionLabel>FILTRO · CAMADAS</SectionLabel>
      <div className="space-y-1.5">
        <LayerToggle
          label="Heatmap"
          checked={showHeatmap}
          onChange={setShowHeatmap}
          swatch={
            <span
              className="size-3 rounded-full"
              style={{ background: 'linear-gradient(90deg,#7E22CE,#DC2626,#FEF08A)' }}
            />
          }
        />
        <LayerToggle
          label="Áreas FM"
          checked={showAreasFm}
          onChange={setShowAreasFm}
          swatch={
            <span
              className="size-3 rounded-sm"
              style={{ background: 'linear-gradient(90deg,#84CC16,#FBBF24,#EA580C,#DC2626)' }}
            />
          }
        />
        <LayerToggle
          label="Câmeras FM"
          checked={showCameras}
          onChange={setShowCameras}
          swatch={
            <span
              className="compstat-camera-marker"
              style={{ width: 16, height: 16 }}
            >
              <CameraGlyph size={9} />
            </span>
          }
        />
        <LayerToggle
          label="Fatores urbanos"
          checked={showUrbanFactors}
          onChange={setShowUrbanFactors}
          swatch={<span className="compstat-urban-marker compstat-urban-marker--small" />}
        />
        <LayerToggle
          label="Facilitadores"
          checked={showFacilitators}
          onChange={setShowFacilitators}
          swatch={<span className="compstat-facilitator-marker compstat-facilitator-marker--small" />}
        />
        <LayerToggle
          label="Denúncias"
          checked={showDenuncias}
          onChange={setShowDenuncias}
          swatch={
            <span
              className="size-3 rounded-full"
              style={{ background: 'linear-gradient(90deg,#EC4899,#F97316,#FEF08A)' }}
            />
          }
        />
        <LayerToggle
          label="Domínio ORCRIM"
          checked={showOrcrim}
          onChange={setShowOrcrim}
          swatch={
            <span
              className="size-3 rounded-sm"
              style={{
                background: 'linear-gradient(90deg,#DC2626,#3B82F6,#F59E0B,#10B981)',
              }}
            />
          }
        />
      </div>
    </aside>
  )
}


function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="font-mono mb-2 text-[9.5px] uppercase tracking-widest text-ink-3">
      {children}
    </div>
  )
}

function LayerToggle({
  label,
  checked,
  onChange,
  hint,
  swatch,
  disabled,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  hint?: string
  swatch?: ReactNode
  disabled?: boolean
}) {
  return (
    <label
      className={`flex items-center gap-2 rounded border border-bg-4 bg-bg-2 px-2.5 py-1.5 text-[11.5px] transition hover:bg-bg-3 ${
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
        disabled={disabled}
        className="size-3.5 accent-accent-orange"
      />
      {swatch}
      <span className="flex-1 truncate text-ink-1">{label}</span>
      {hint ? (
        <span className="font-mono text-[9.5px] uppercase tracking-wider text-ink-3">
          {hint}
        </span>
      ) : null}
    </label>
  )
}

function PillButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`font-mono rounded border px-2.5 py-1 text-[10.5px] uppercase tracking-wider transition ${
        active
          ? 'border-accent-orange bg-accent-orange text-white'
          : 'border-bg-4 bg-bg-2 text-ink-2 hover:border-ink-3 hover:bg-bg-3 hover:text-ink-1'
      }`}
    >
      {children}
    </button>
  )
}

function DeckHeatmapLayer({
  id,
  points,
  colors,
  radiusPixels = 32,
  intensity = 1.15,
}: {
  id: string
  points: HeatPoint[]
  colors: [number, number, number][]
  radiusPixels?: number
  intensity?: number
}) {
  const map = useMap()

  const layer = useMemo(
    () =>
      new HeatmapLayer<HeatPoint>({
        id,
        data: points,
        getPosition: (d: HeatPoint) => [d.lng, d.lat],
        getWeight: (d: HeatPoint) => d.weight,
        radiusPixels,
        intensity,
        threshold: 0.035,
        aggregation: 'SUM',
        colorRange: colors,
      }),
    [colors, id, intensity, points, radiusPixels],
  )

  useEffect(() => {
    if (!map) return
    const overlay = new GoogleMapsOverlay({ layers: [layer] })
    overlay.setMap(map)
    return () => {
      overlay.setMap(null)
      overlay.finalize()
    }
  }, [map, layer])

  return null
}

function RouteLayer({
  start,
  end,
  waypoints,
}: {
  start: google.maps.LatLngLiteral
  end: google.maps.LatLngLiteral
  waypoints: RouteWaypoint[]
}) {
  const map = useMap()

  useEffect(() => {
    if (!map) return

    const renderer = new google.maps.DirectionsRenderer({
      map,
      suppressMarkers: true,
      preserveViewport: false,
      polylineOptions: {
        strokeColor: '#FFFFFF',
        strokeOpacity: 0.95,
        strokeWeight: 5,
        zIndex: 80,
      },
    })
    const service = new google.maps.DirectionsService()
    service.route(
      {
        origin: start,
        destination: end,
        travelMode: google.maps.TravelMode.DRIVING,
        waypoints: waypoints.map((point) => ({
          location: { lat: point.lat, lng: point.lng },
          stopover: false,
        })),
        optimizeWaypoints: false,
      },
      (result, status) => {
        if (status === google.maps.DirectionsStatus.OK && result) {
          renderer.setDirections(result)
        }
      },
    )

    return () => {
      renderer.setMap(null)
    }
  }, [end, map, start, waypoints])

  return null
}

function RouteEndpointMarker({
  point,
  label,
}: {
  point: google.maps.LatLngLiteral
  label: string
}) {
  return (
    <AdvancedMarker position={point} title={label === 'I' ? 'Início' : 'Fim'}>
      <div className="compstat-route-endpoint">{label}</div>
    </AdvancedMarker>
  )
}

function UrbanFactorsLayer({
  factors,
  onSelect,
}: {
  factors: UrbanFactor[]
  onSelect: (factor: UrbanFactor) => void
}) {
  return (
    <>
      {factors.map((factor) => {
        const color = URBAN_FACTOR_COLORS[factor.type] ?? URBAN_FACTOR_COLORS.outro
        return (
          <AdvancedMarker
            key={factor.id}
            position={{ lat: factor.lat, lng: factor.lng }}
            title={factor.occurrence_type}
            onClick={() => onSelect(factor)}
          >
            <div
              className="compstat-urban-marker"
              style={{ borderColor: color, color, background: markerBackground(color) }}
            />
          </AdvancedMarker>
        )
      })}
    </>
  )
}

function FacilitatorsLayer({
  facilitators,
  onSelect,
}: {
  facilitators: Facilitator[]
  onSelect: (facilitator: Facilitator) => void
}) {
  return (
    <>
      {facilitators.map((facilitator) => {
        const color = URBAN_FACTOR_COLORS[facilitator.type] ?? '#EC4899'
        return (
          <AdvancedMarker
            key={facilitator.id}
            position={{ lat: facilitator.lat, lng: facilitator.lng }}
            title={facilitator.description}
            onClick={() => onSelect(facilitator)}
          >
            <div
              className="compstat-facilitator-marker"
              style={{ borderColor: color, color, background: markerBackground(color) }}
            />
          </AdvancedMarker>
        )
      })}
    </>
  )
}

function OrcrimLayer({ polygons }: { polygons: OrcrimPolygon[] }) {
  const map = useMap()

  useEffect(() => {
    if (!map) return
    const created: google.maps.Polygon[] = polygons.map((poly) => {
      const color = FACTION_COLORS[poly.faction] ?? '#8B95A7'
      const fill = FACTION_RGBA[poly.faction] ?? [139, 149, 167, 70]
      const p = new google.maps.Polygon({
        paths: poly.ring.map(([lat, lng]) => ({ lat, lng })),
        strokeColor: color,
        strokeOpacity: 0.95,
        strokeWeight: 1.4,
        fillColor: `rgb(${fill[0]}, ${fill[1]}, ${fill[2]})`,
        fillOpacity: fill[3] / 255,
        map,
      })
      p.addListener('click', (event: google.maps.PolyMouseEvent) => {
        const safeName = (poly.name || 'Território').replace(/[<>&"]/g, '')
        const safeFaction = poly.faction.replace(/[<>&"]/g, '')
        new google.maps.InfoWindow({
          content: `<div style="font-family:Inter;min-width:180px"><div style="font-weight:600;font-size:12px;color:#F4F5F7;margin-bottom:4px">${safeName}</div><div style="font-size:10.5px;color:#8B95A7;font-family:'JetBrains Mono'">FACÇÃO · ${safeFaction}</div></div>`,
          position: event.latLng ?? undefined,
        }).open({ map })
      })
      return p
    })
    return () => {
      created.forEach((p) => p.setMap(null))
    }
  }, [map, polygons])

  return null
}

function AreasFmLayer({
  areas,
  selectedId,
  onSelect,
  routePickMode,
  onRoutePoint,
}: {
  areas: AreaFM[]
  selectedId: string | null
  onSelect: (id: string) => void
  routePickMode: RoutePickMode
  onRoutePoint: (point: google.maps.LatLngLiteral) => void
}) {
  const map = useMap()
  const selectedRef = useRef(selectedId)
  useEffect(() => {
    selectedRef.current = selectedId
  }, [selectedId])

  useEffect(() => {
    if (!map) return
    const polys: google.maps.Polygon[] = []
    areas.forEach((area) => {
      const color = scoreColor(area.score)
      const [r, g, b] = hexToRgb(color)
      const isSelected = area.id === selectedRef.current
      const poly = new google.maps.Polygon({
        paths: area.ring.map(([lat, lng]) => ({ lat, lng })),
        strokeColor: isSelected ? '#FF6B35' : '#F4F5F7',
        strokeOpacity: isSelected ? 1 : 0.55,
        strokeWeight: isSelected ? 2.5 : 1,
        fillColor: `rgb(${r}, ${g}, ${b})`,
        fillOpacity: isSelected ? 0.35 : 0.25,
        clickable: true,
        zIndex: isSelected ? 50 : 10,
        map,
      })
      poly.addListener('mouseover', () => {
        if (area.id !== selectedRef.current) {
          poly.setOptions({ strokeWeight: 2, strokeOpacity: 0.9, fillOpacity: 0.4 })
        }
      })
      poly.addListener('mouseout', () => {
        if (area.id !== selectedRef.current) {
          poly.setOptions({ strokeWeight: 1, strokeOpacity: 0.55, fillOpacity: 0.25 })
        }
      })
      poly.addListener('click', (event: google.maps.PolyMouseEvent) => {
        if (routePickMode && event.latLng) {
          onRoutePoint(event.latLng.toJSON())
          return
        }
        onSelect(area.id)
      })
      polys.push(poly)
    })
    return () => {
      polys.forEach((p) => p.setMap(null))
    }
  }, [map, areas, onRoutePoint, onSelect, routePickMode])

  // fitBounds when selection changes
  useEffect(() => {
    if (!map || !selectedId) return
    const area = areas.find((a) => a.id === selectedId)
    if (!area) return
    const bounds = new google.maps.LatLngBounds()
    area.ring.forEach(([lat, lng]) => bounds.extend({ lat, lng }))
    map.fitBounds(bounds, 80)
  }, [map, selectedId, areas])

  return null
}

function AreaReportPanel({
  area,
  report,
  state,
  onClose,
}: {
  area: AreaFM
  report: AreaReport | null
  state: LoadState
  onClose: () => void
}) {
  const color = scoreColor(area.score)
  return (
    <aside className="scrollbar overflow-y-auto border-l border-bg-4 bg-bg-1/95 backdrop-blur">
      <div className="flex items-start justify-between border-b border-bg-4 px-4 py-3">
        <div className="min-w-0">
          <div className="font-mono text-[9.5px] uppercase tracking-widest text-ink-3">
            Área Força Municipal
          </div>
          <div
            className="mt-0.5 text-[13px] font-semibold leading-tight text-ink-0"
            title={area.name}
          >
            {area.name}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-ink-3 hover:bg-bg-2 hover:text-ink-1"
          aria-label="Fechar relatório"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="space-y-4 p-4">
        <div className="rounded border border-bg-4 bg-bg-2 p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-mono text-[9.5px] uppercase tracking-widest text-ink-3">
                Score de risco
              </div>
              <div className="num-mono mt-1 text-[24px] font-semibold leading-none text-ink-0">
                {Math.round(area.score * 100)}
              </div>
            </div>
            <div
              className="size-12 rounded-full"
              style={{ background: color, boxShadow: `0 0 18px ${color}66` }}
            />
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded bg-bg-3">
            <div
              className="h-full rounded"
              style={{ width: `${Math.round(area.score * 100)}%`, background: color }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <StatCard
            label="Ocorrências"
            value={
              state === 'ready' && report
                ? report.total_ocorrencias.toLocaleString('pt-BR')
                : '—'
            }
            sub={state === 'loading' ? 'carregando…' : 'desde 2020'}
          />
          <StatCard
            label="Δ vs mês anterior"
            value={
              state === 'ready' && report && report.delta_pct != null
                ? `${report.delta_pct > 0 ? '+' : ''}${report.delta_pct.toFixed(1)}%`
                : '—'
            }
            sub={
              state === 'ready' && report?.last_month
                ? `${report.last_month.n.toLocaleString('pt-BR')} no último mês`
                : 'sem dado'
            }
            color={
              report?.delta_pct != null
                ? report.delta_pct > 0
                  ? '#DC2626'
                  : '#10B981'
                : undefined
            }
          />
          <StatCard
            label="Hora pico"
            value={
              state === 'ready' && report?.peak_hour != null
                ? `${String(report.peak_hour).padStart(2, '0')}h`
                : '—'
            }
            sub={
              state === 'ready' && report?.peak_hour_n != null
                ? `${report.peak_hour_n.toLocaleString('pt-BR')} ocorrências`
                : 'sem dado'
            }
          />
          <StatCard
            label="Top crime"
            value={
              state === 'ready' && report?.top_delitos?.[0]
                ? truncate(report.top_delitos[0].delito, 18)
                : '—'
            }
            sub={
              state === 'ready' && report?.top_delitos?.[0]
                ? `${report.top_delitos[0].n.toLocaleString('pt-BR')} casos`
                : ''
            }
          />
        </div>

        {state === 'ready' && report && report.dinamica && (
          <div>
            <SectionLabel>Dinâmica criminal</SectionLabel>
            <div className="rounded border border-bg-4 border-l-2 border-l-accent-orange bg-bg-2 p-3 text-[11.5px] leading-relaxed text-ink-1">
              {report.dinamica}
            </div>
          </div>
        )}

        {state === 'ready' && report && report.top_delitos.length > 0 && (
          <div>
            <SectionLabel>Top crimes</SectionLabel>
            <div className="space-y-1">
              {report.top_delitos.map((d) => {
                const max = report.top_delitos[0].n || 1
                return (
                  <div
                    key={d.delito}
                    className="rounded border border-bg-4 bg-bg-2 px-2.5 py-1.5"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="truncate text-ink-1">{d.delito}</span>
                      <span className="num-mono text-ink-2">
                        {d.n.toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded bg-bg-3">
                      <div
                        className="h-full rounded"
                        style={{
                          width: `${(d.n / max) * 100}%`,
                          background: '#FF6B35',
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {state === 'ready' && report && report.top_logradouros.length > 0 && (
          <div>
            <SectionLabel>Top logradouros</SectionLabel>
            <div className="overflow-hidden rounded border border-bg-4 bg-bg-2">
              {report.top_logradouros.slice(0, 8).map((l, i) => (
                <a
                  key={l.logradouro}
                  href={`https://www.google.com/maps/search/${encodeURIComponent(l.logradouro + ' Rio de Janeiro')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between border-b border-bg-4 px-2.5 py-1.5 text-[11px] transition last:border-0 hover:bg-bg-3"
                >
                  <span className="flex items-center gap-2 truncate">
                    <span className="num-mono w-5 text-ink-3">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="truncate text-ink-1">{l.logradouro}</span>
                  </span>
                  <span className="num-mono ml-2 text-ink-2">
                    {l.n.toLocaleString('pt-BR')}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        {state === 'ready' && report && report.fatores_ranking.length > 0 && (
          <div>
            <SectionLabel>Fatores urbanos prioritários</SectionLabel>
            <div className="space-y-1 rounded border border-bg-4 bg-bg-2 p-2">
              {report.fatores_ranking.slice(0, 8).map((f, i) => (
                <div
                  key={`${f.orgao}-${f.tipo}-${i}`}
                  className="flex items-center justify-between text-[11px]"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <OrgaoBadge orgao={f.orgao} />
                    <span className="truncate text-ink-1">{f.tipo}</span>
                  </div>
                  <span className="num-mono ml-2 text-ink-2">
                    {f.n.toLocaleString('pt-BR')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {state === 'ready' && report && report.bingos.length > 0 && (
          <div>
            <SectionLabel>
              Painel de coincidências (bingos) · {report.bingos.length}
            </SectionLabel>
            <div className="space-y-1.5 rounded border border-bg-4 bg-bg-2 p-2.5">
              {report.bingos.slice(0, 6).map((b, i) => (
                <div
                  key={`${b.logradouro}-${i}`}
                  className="flex items-start gap-2 text-[11px]"
                >
                  <span className="mt-0.5 text-accent-red">●</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-ink-1">{b.logradouro}</span>
                      <span className="num-mono text-[9.5px] text-ink-3">
                        {b.ocorrencias.toLocaleString('pt-BR')} · {b.n_fatores}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-ink-2">
                      <OrgaoBadge orgao={b.orgao} />
                      <span className="truncate">{b.fator}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {state === 'ready' && report && report.monthly_series.length > 0 && (
          <div>
            <SectionLabel>Série mensal (últimos {report.monthly_series.length})</SectionLabel>
            <MonthBars series={report.monthly_series} />
          </div>
        )}

        {state === 'ready' && report && report.hour_distribution.length > 0 && (
          <div>
            <SectionLabel>Distribuição por hora</SectionLabel>
            <HourBars buckets={report.hour_distribution} />
          </div>
        )}

        {state === 'loading' && (
          <div className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
            Carregando relatório…
          </div>
        )}
        {state === 'error' && (
          <div className="font-mono text-[10.5px] uppercase tracking-wider text-accent-red">
            Falha ao carregar relatório.
          </div>
        )}
      </div>
    </aside>
  )
}

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string
  value: string
  sub?: string
  color?: string
}) {
  return (
    <div className="rounded border border-bg-4 bg-bg-2 px-2.5 py-2">
      <div className="font-mono text-[9.5px] uppercase tracking-widest text-ink-3">
        {label}
      </div>
      <div
        className="num-mono mt-1 text-[16px] font-semibold leading-tight"
        style={{ color: color ?? '#F4F5F7' }}
      >
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-[10px] text-ink-2">{sub}</div> : null}
    </div>
  )
}

const ORGAO_COLORS: Record<string, string> = {
  COMLURB: '#10B981',
  SEOP: '#3B82F6',
  RIOLUZ: '#F59E0B',
  RioLuz: '#F59E0B',
  SECONSERVA: '#8B5CF6',
  SMAS: '#EC4899',
  'CET-RIO': '#06B6D4',
  'CET-Rio': '#06B6D4',
  SMTR: '#14B8A6',
  'GM-RIO': '#DC2626',
  'GM-Rio': '#DC2626',
}

function OrgaoBadge({ orgao }: { orgao: string }) {
  const color = ORGAO_COLORS[orgao] ?? '#8B95A7'
  return (
    <span
      className="font-mono inline-block whitespace-nowrap rounded border px-1.5 py-[1px] text-[9.5px] font-semibold uppercase tracking-wider"
      style={{
        color,
        borderColor: `${color}66`,
        background: `${color}15`,
      }}
    >
      {orgao || '—'}
    </span>
  )
}

function HeatmapLegend() {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded border border-bg-4 bg-bg-1/95 px-3 py-2 backdrop-blur shadow-md">
      <div className="font-mono mb-1.5 text-[9.5px] uppercase tracking-widest text-ink-3">
        Heatmap · ocorrências
      </div>
      <div
        className="h-2 w-44 rounded-sm"
        style={{
          background:
            'linear-gradient(90deg,#3B0764 0%,#7E22CE 25%,#DC2626 55%,#FB923C 80%,#FEF08A 100%)',
        }}
      />
      <div className="font-mono mt-1 flex justify-between text-[9px] uppercase tracking-wider text-ink-3">
        <span>Menos</span>
        <span>Mais</span>
      </div>
    </div>
  )
}

function MonthBars({ series }: { series: { ano: number; mes: number; n: number }[] }) {
  if (series.length === 0) return null
  const max = Math.max(1, ...series.map((m) => m.n))
  const total = series.reduce((s, m) => s + m.n, 0)
  const avg = total / series.length
  const first = series[0]
  const last = series[series.length - 1]
  const lastN = last.n
  const prevN = series.length > 1 ? series[series.length - 2].n : null
  const trendPct = prevN != null && prevN > 0 ? ((lastN - prevN) / prevN) * 100 : null
  const MONTH_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return (
    <div className="rounded border border-bg-4 bg-bg-2 p-2">
      <div className="flex h-16 items-end gap-[2px]">
        {series.map((m) => {
          const pct = (m.n / max) * 100
          const isLast = m === last
          return (
            <div
              key={`${m.ano}-${m.mes}`}
              className="flex-1 rounded-sm"
              style={{
                height: `${Math.max(pct, 2)}%`,
                background: isLast ? '#FF6B35' : '#5A6478',
                opacity: 0.85,
              }}
              title={`${MONTH_PT[m.mes - 1]}/${m.ano} · ${m.n}`}
            />
          )
        })}
      </div>
      <div className="font-mono mt-1 flex justify-between text-[8.5px] text-ink-3">
        <span>{`${MONTH_PT[first.mes - 1]}/${String(first.ano).slice(2)}`}</span>
        <span>{`média ${avg.toFixed(0)}`}</span>
        <span>
          {`${MONTH_PT[last.mes - 1]}/${String(last.ano).slice(2)}`}
          {trendPct != null && (
            <span
              className="ml-1"
              style={{ color: trendPct >= 0 ? '#DC2626' : '#10B981' }}
            >
              {trendPct >= 0 ? '▲' : '▼'} {Math.abs(trendPct).toFixed(0)}%
            </span>
          )}
        </span>
      </div>
    </div>
  )
}

function HourBars({ buckets }: { buckets: { hour: number; n: number }[] }) {
  const byHour = new Map<number, number>()
  for (const b of buckets) byHour.set(b.hour, b.n)
  const max = Math.max(1, ...buckets.map((b) => b.n))
  return (
    <div className="rounded border border-bg-4 bg-bg-2 p-2">
      <div className="flex h-16 items-end gap-[2px]">
        {Array.from({ length: 24 }, (_, h) => {
          const n = byHour.get(h) ?? 0
          const pct = (n / max) * 100
          const peak = h >= 19 && h <= 23
          return (
            <div
              key={h}
              className="flex-1 rounded-sm"
              style={{
                height: `${Math.max(pct, 2)}%`,
                background: peak ? '#FF6B35' : '#5A6478',
                opacity: n === 0 ? 0.25 : 0.85,
              }}
              title={`${String(h).padStart(2, '0')}h · ${n}`}
            />
          )
        })}
      </div>
      <div className="font-mono mt-1 flex justify-between text-[8.5px] text-ink-3">
        <span>00h</span>
        <span>06h</span>
        <span>12h</span>
        <span>18h</span>
        <span>23h</span>
      </div>
    </div>
  )
}

function truncate(s: string, n: number) {
  return s.length <= n ? s : s.slice(0, n - 1) + '…'
}

function markerBackground(hex: string) {
  return `${hex}33`
}

function DetailPanel({
  detail,
  onClose,
}: {
  detail:
    | { kind: 'urban_factor'; value: UrbanFactor }
    | { kind: 'facilitator'; value: Facilitator }
  onClose: () => void
}) {
  const isFactor = detail.kind === 'urban_factor'
  const value = detail.value
  const color = URBAN_FACTOR_COLORS[value.type] ?? '#EC4899'
  const title = isFactor
    ? (value as UrbanFactor).occurrence_type || value.type
    : (value as Facilitator).description || value.type
  const eyebrow = isFactor ? 'Fator urbano' : 'Facilitador'

  return (
    <aside className="scrollbar overflow-y-auto border-l border-bg-4 bg-bg-1/95 backdrop-blur">
      <div className="flex items-start justify-between border-b border-bg-4 px-4 py-3">
        <div className="min-w-0">
          <div className="font-mono text-[9.5px] uppercase tracking-widest text-ink-3">
            {eyebrow}
          </div>
          <div
            className="mt-0.5 text-[13px] font-semibold leading-tight text-ink-0"
            title={title}
          >
            {title}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-ink-3 hover:bg-bg-2 hover:text-ink-1"
          aria-label="Fechar detalhe"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="space-y-4 p-4 text-[12px] text-ink-1">
        <div className="rounded border border-bg-4 bg-bg-2 p-3">
          <div className="font-mono mb-1.5 text-[9.5px] uppercase tracking-widest text-ink-3">
            Classificação
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="font-mono inline-block whitespace-nowrap rounded border px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wider"
              style={{
                color,
                borderColor: `${color}66`,
                background: `${color}1A`,
              }}
            >
              {value.type}
            </span>
            <OrgaoBadge orgao={value.agency} />
          </div>
        </div>

        <div className="rounded border border-bg-4 bg-bg-2 p-3">
          <div className="font-mono mb-1.5 text-[9.5px] uppercase tracking-widest text-ink-3">
            Localização
          </div>
          <div className="text-ink-1">{value.street || '—'}</div>
          {value.neighborhood ? (
            <div className="mt-0.5 text-[11px] text-ink-2">{value.neighborhood}</div>
          ) : null}
          <div className="font-mono mt-2 flex gap-3 text-[10px] uppercase tracking-wider text-ink-3">
            <span>lat {value.lat.toFixed(5)}</span>
            <span>lng {value.lng.toFixed(5)}</span>
          </div>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${value.lat},${value.lng}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono mt-2 inline-flex items-center gap-1 rounded border border-accent-orange/40 bg-accent-orange/10 px-2 py-1 text-[10px] uppercase tracking-wider text-accent-orange hover:bg-accent-orange/20"
          >
            Abrir no Google Maps
          </a>
        </div>

        {value.description ? (
          <div>
            <div className="font-mono mb-1.5 text-[9.5px] uppercase tracking-widest text-ink-3">
              Descrição
            </div>
            <div className="rounded border border-bg-4 bg-bg-2 p-3 text-[12px] leading-relaxed text-ink-1">
              {value.description}
            </div>
          </div>
        ) : null}

        {!isFactor && (value as Facilitator).evidence ? (
          <div>
            <div className="font-mono mb-1.5 text-[9.5px] uppercase tracking-widest text-ink-3">
              Evidência
            </div>
            <div className="rounded border border-bg-4 border-l-2 border-l-accent-orange bg-bg-2 p-3 text-[11.5px] leading-relaxed text-ink-1">
              {(value as Facilitator).evidence}
            </div>
            {(value as Facilitator).confidence ? (
              <div className="font-mono mt-2 text-[10px] uppercase tracking-wider text-ink-3">
                Confiança · {(value as Facilitator).confidence}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  )
}

export default MapView
