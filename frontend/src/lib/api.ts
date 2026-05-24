const RAW_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api').toString().trim()
const API_BASE = RAW_BASE.replace(/\/+$/, '')

function url(path: string): string {
  if (!API_BASE) return path
  if (path.startsWith('/')) return `${API_BASE}${path}`
  return `${API_BASE}/${path}`
}

async function getJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const requestUrl = url(path)
  const response = await fetch(requestUrl, {
    ...init,
    headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`GET ${requestUrl} -> ${response.status} ${text}`.trim())
  }
  return (await response.json()) as T
}

export type Camera = {
  id: string
  area: string
  lat: number
  lng: number
}

export type UrbanFactor = {
  id: string
  type: string
  agency: string
  occurrence_type: string
  description: string
  street: string
  neighborhood: string
  lat: number
  lng: number
}

export type Facilitator = {
  id: string
  urban_factor_id: string
  type: string
  agency: string
  description: string
  evidence: string
  confidence: string
  street: string
  neighborhood: string
  lat: number
  lng: number
}

export type OrcrimPolygon = {
  name: string
  faction: string
  ring: [number, number][]
}

export type HeatPoint = {
  lat: number
  lng: number
  weight: number
}

export type RouteWaypoint = {
  id: string
  lat: number
  lng: number
  crime_type: string
  date: string | null
  street: string
  progress: number
  distance_m: number
}

export type HeatFilter = {
  year?: number
  delito?: 'transeunte' | 'celular' | 'coletivo' | 'all'
  hour_min?: number
  hour_max?: number
  max_points?: number
  bin_precision?: number
}

export type DenunciasHeatFilter = {
  hour_min?: number
  hour_max?: number
  max_points?: number
  bin_precision?: number
}

export type AreaFM = {
  id: string
  name: string
  n_ocorrencias: number
  score: number
  ring: [number, number][]
}

export type AreaMonth = { ano: number; mes: number; n: number }
export type AreaHourBucket = { hour: number; n: number }
export type AreaTopDelito = { delito: string; n: number }

export type AreaTopLogradouro = { logradouro: string; n: number }
export type AreaFatorRanking = { orgao: string; tipo: string; n: number }
export type AreaBingo = {
  logradouro: string
  orgao: string
  fator: string
  ocorrencias: number
  n_fatores: number
}

export type AreaReport = {
  id: string
  name: string
  total_ocorrencias: number
  last_month: AreaMonth | null
  previous_month: AreaMonth | null
  delta_pct: number | null
  peak_hour: number | null
  peak_hour_n: number | null
  dia_pico: string | null
  n_fatores_total: number
  monthly_series: AreaMonth[]
  hour_distribution: AreaHourBucket[]
  top_delitos: AreaTopDelito[]
  top_logradouros: AreaTopLogradouro[]
  fatores_ranking: AreaFatorRanking[]
  bingos: AreaBingo[]
  dinamica: string
}

export const api = {
  cameras: () => getJSON<{ count: number; items: Camera[] }>('/geo/cameras'),
  urbanFactors: (limit = 3000) =>
    getJSON<{ count: number; items: UrbanFactor[] }>(`/geo/urban-factors?limit=${limit}`),
  facilitators: (limit = 3000) =>
    getJSON<{ count: number; items: Facilitator[] }>(`/geo/facilitators?limit=${limit}`),
  orcrim: (faction?: string) =>
    getJSON<{ count: number; items: OrcrimPolygon[] }>(
      faction ? `/geo/orcrim?faction=${encodeURIComponent(faction)}` : '/geo/orcrim',
    ),
  heat: (filter: HeatFilter = {}) => {
    const params = new URLSearchParams()
    if (filter.year != null) params.set('year', String(filter.year))
    if (filter.delito) params.set('delito', filter.delito)
    if (filter.hour_min != null) params.set('hour_min', String(filter.hour_min))
    if (filter.hour_max != null) params.set('hour_max', String(filter.hour_max))
    if (filter.max_points != null) params.set('max_points', String(filter.max_points))
    if (filter.bin_precision != null) params.set('bin_precision', String(filter.bin_precision))
    const qs = params.toString()
    return getJSON<{ count: number; sampled: number; items: HeatPoint[] }>(
      qs ? `/geo/heat?${qs}` : '/geo/heat',
    )
  },
  areasFm: () => getJSON<{ count: number; items: AreaFM[] }>('/geo/areas-fm'),
  areaReport: (id: string) =>
    getJSON<AreaReport>(`/geo/areas-fm/${encodeURIComponent(id)}/report`),
  denunciasHeat: (filter: DenunciasHeatFilter = {}) => {
    const params = new URLSearchParams()
    if (filter.hour_min != null) params.set('hour_min', String(filter.hour_min))
    if (filter.hour_max != null) params.set('hour_max', String(filter.hour_max))
    params.set('max_points', String(filter.max_points ?? 8000))
    params.set('bin_precision', String(filter.bin_precision ?? 3))
    return getJSON<{ count: number; sampled: number; items: HeatPoint[] }>(
      `/geo/denuncias/heat?${params.toString()}`,
    )
  },
  routeWaypoints: ({
    start,
    end,
    limit = 8,
    corridorM = 300,
  }: {
    start: { lat: number; lng: number }
    end: { lat: number; lng: number }
    limit?: number
    corridorM?: number
  }) => {
    const params = new URLSearchParams({
      start_lat: String(start.lat),
      start_lng: String(start.lng),
      end_lat: String(end.lat),
      end_lng: String(end.lng),
      limit: String(limit),
      corridor_m: String(corridorM),
    })
    return getJSON<{ count: number; items: RouteWaypoint[] }>(
      `/geo/route-waypoints?${params.toString()}`,
    )
  },
}
