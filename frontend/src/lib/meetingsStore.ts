import { useSyncExternalStore } from 'react'

export type MeetingStatus = 'rascunho' | 'agendada' | 'concluida'

export type MeetingAttachment = {
  id: string
  nome: string
  tipo: string
  tamanho: number
  conteudo: string
  ehTexto: boolean
  criadoEm: string
}

export type MeetingMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  ts: string
}

export type MetaStatus = 'pendente' | 'em_andamento' | 'concluida' | 'cancelada'
export type AcaoStatus =
  | 'pendente'
  | 'em_andamento'
  | 'concluida'
  | 'bloqueada'
  | 'cancelada'

export type Meta = {
  id: string
  titulo: string
  metrica: string
  responsavel: string
  prazo: string
  status: MetaStatus
  criadaEm: string
  atualizadaEm: string
}

export type Decisao = {
  id: string
  titulo: string
  contexto: string
  responsavel: string
  criadaEm: string
}

export type Acao = {
  id: string
  titulo: string
  descricao: string
  responsavel: string
  orgao: string
  prazo: string
  status: AcaoStatus
  areaFM: string
  criadaEm: string
  atualizadaEm: string
}

export type PlanoAcao = {
  metas: Meta[]
  decisoes: Decisao[]
  acoes: Acao[]
}

export type Meeting = {
  id: string
  titulo: string
  data: string
  local: string
  participantes: string
  areasFM: string[]
  notas: string
  anexos: MeetingAttachment[]
  mensagens: MeetingMessage[]
  plano: PlanoAcao
  status: MeetingStatus
  criadaEm: string
  atualizadaEm: string
}

export type MeetingsState = {
  meetings: Meeting[]
  selectedId: string | null
  isSending: boolean
  error: string | null
}

const STORAGE_KEY = 'compstat:meetings:v1'
const SELECTED_KEY = 'compstat:meetings:selected'

function nowIso() {
  return new Date().toISOString()
}

function uid() {
  return crypto.randomUUID()
}

function emptyPlano(): PlanoAcao {
  return { metas: [], decisoes: [], acoes: [] }
}

function migrate(meeting: Meeting): Meeting {
  const migrated = {
    ...meeting,
    anexos: meeting.anexos ?? [],
    mensagens: (meeting.mensagens ?? []).map((msg) => ({
      id: msg.id ?? uid(),
      role: msg.role,
      content: msg.content,
      ts: msg.ts,
    })),
  }
  if (!meeting.plano || typeof meeting.plano !== 'object') {
    return { ...migrated, plano: emptyPlano() }
  }
  return {
    ...migrated,
    plano: {
      metas: meeting.plano.metas ?? [],
      decisoes: meeting.plano.decisoes ?? [],
      acoes: meeting.plano.acoes ?? [],
    },
  }
}

function loadMeetings(): Meeting[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Meeting[]
    if (!Array.isArray(parsed)) return []
    return parsed.map(migrate)
  } catch {
    return []
  }
}

function loadSelected(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(SELECTED_KEY)
  } catch {
    return null
  }
}

function persist(meetings: Meeting[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(meetings))
  } catch (error) {
    console.warn('Falha ao salvar reuniões no localStorage', error)
  }
}

function persistSelected(id: string | null) {
  if (typeof window === 'undefined') return
  try {
    if (id) window.localStorage.setItem(SELECTED_KEY, id)
    else window.localStorage.removeItem(SELECTED_KEY)
  } catch {
    // ignore
  }
}

const initial = loadMeetings()
const initialSelected = loadSelected()
const initialValid =
  initialSelected && initial.some((m) => m.id === initialSelected)
    ? initialSelected
    : initial[0]?.id ?? null

let state: MeetingsState = {
  meetings: initial,
  selectedId: initialValid,
  isSending: false,
  error: null,
}

const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function setState(patch: Partial<MeetingsState>) {
  state = { ...state, ...patch }
  emit()
}

function updateMeeting(id: string, mutate: (m: Meeting) => Meeting) {
  const meetings = state.meetings.map((m) =>
    m.id === id ? { ...mutate(m), atualizadaEm: nowIso() } : m,
  )
  setState({ meetings })
  persist(meetings)
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '/api').toString()
const meetingsUrl = `${apiBaseUrl.replace(/\/+$/, '')}/meetings`

async function requestJSON<T>(path = '', init?: RequestInit): Promise<T> {
  const response = await fetch(`${meetingsUrl}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`${response.status} ${text}`.trim())
  }
  return (await response.json()) as T
}

function reportSyncError(caught: unknown) {
  const message = caught instanceof Error ? caught.message : 'Falha ao salvar reunião.'
  setState({ error: message })
}

function replaceMeeting(meeting: Meeting) {
  const meetings = state.meetings.map((m) => (m.id === meeting.id ? migrate(meeting) : m))
  setState({ meetings })
  persist(meetings)
}

async function refreshMeetings(): Promise<void> {
  try {
    const data = await requestJSON<{ items: Meeting[] }>()
    const meetings = data.items.map(migrate)
    const selectedId =
      state.selectedId && meetings.some((m) => m.id === state.selectedId)
        ? state.selectedId
        : meetings[0]?.id ?? null
    setState({ meetings, selectedId, error: null })
    persist(meetings)
    persistSelected(selectedId)
  } catch (caught) {
    reportSyncError(caught)
  }
}

function syncMeeting(meeting: Meeting) {
  void requestJSON<{ item: Meeting }>('', {
    method: 'POST',
    body: JSON.stringify(meeting),
  })
    .then(({ item }) => replaceMeeting(item))
    .catch(reportSyncError)
}

function syncPatch(meetingId: string, patch: object) {
  void requestJSON<{ item: Meeting }>(`/${meetingId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
    .then(({ item }) => replaceMeeting(item))
    .catch(reportSyncError)
}

function syncDelete(path: string, meetingId?: string) {
  void requestJSON<{ item?: Meeting }>(path, { method: 'DELETE' })
    .then(({ item }) => {
      if (item) replaceMeeting(item)
      else if (meetingId) void refreshMeetings()
    })
    .catch(reportSyncError)
}

function syncChild(path: string, payload: object, method = 'POST') {
  void requestJSON<{ item: Meeting }>(path, {
    method,
    body: JSON.stringify(payload),
  })
    .then(({ item }) => replaceMeeting(item))
    .catch(reportSyncError)
}

if (typeof window !== 'undefined') {
  void refreshMeetings()
}

export function useMeetings(): MeetingsState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
    () => state,
    () => state,
  )
}

export function selectMeeting(id: string | null) {
  setState({ selectedId: id, error: null })
  persistSelected(id)
}

export function createMeeting(input: {
  titulo: string
  data: string
  local?: string
  participantes?: string
  areasFM?: string[]
  notas?: string
}): Meeting {
  const meeting: Meeting = {
    id: uid(),
    titulo: input.titulo.trim() || 'Reunião sem título',
    data: input.data,
    local: input.local?.trim() ?? '',
    participantes: input.participantes?.trim() ?? '',
    areasFM: input.areasFM ?? [],
    notas: input.notas?.trim() ?? '',
    anexos: [],
    mensagens: [],
    plano: emptyPlano(),
    status: 'rascunho',
    criadaEm: nowIso(),
    atualizadaEm: nowIso(),
  }
  const meetings = [meeting, ...state.meetings]
  setState({ meetings, selectedId: meeting.id })
  persist(meetings)
  persistSelected(meeting.id)
  syncMeeting(meeting)
  return meeting
}

export function deleteMeeting(id: string) {
  const meetings = state.meetings.filter((m) => m.id !== id)
  const nextSelected =
    state.selectedId === id ? meetings[0]?.id ?? null : state.selectedId
  setState({ meetings, selectedId: nextSelected })
  persist(meetings)
  persistSelected(nextSelected)
  syncDelete(`/${id}`, id)
}

export function patchMeeting(
  id: string,
  patch: Partial<
    Pick<
      Meeting,
      | 'titulo'
      | 'data'
      | 'local'
      | 'participantes'
      | 'areasFM'
      | 'notas'
      | 'status'
    >
  >,
) {
  updateMeeting(id, (m) => ({ ...m, ...patch }))
  syncPatch(id, patch)
}

export function addAttachment(
  id: string,
  attachment: Omit<MeetingAttachment, 'id' | 'criadoEm'>,
) {
  const full: MeetingAttachment = {
    id: uid(),
    criadoEm: nowIso(),
    ...attachment,
  }
  updateMeeting(id, (m) => ({ ...m, anexos: [...m.anexos, full] }))
  syncChild(`/${id}/attachments`, full)
  return full
}

export function removeAttachment(meetingId: string, attachmentId: string) {
  updateMeeting(meetingId, (m) => ({
    ...m,
    anexos: m.anexos.filter((a) => a.id !== attachmentId),
  }))
  syncDelete(`/${meetingId}/attachments/${attachmentId}`)
}

export function clearMessages(meetingId: string) {
  updateMeeting(meetingId, (m) => ({ ...m, mensagens: [] }))
  syncDelete(`/${meetingId}/messages`)
}

export function addMeta(
  meetingId: string,
  input: Omit<Meta, 'id' | 'criadaEm' | 'atualizadaEm'>,
): Meta {
  const meta: Meta = {
    id: uid(),
    criadaEm: nowIso(),
    atualizadaEm: nowIso(),
    ...input,
  }
  updateMeeting(meetingId, (m) => ({
    ...m,
    plano: { ...m.plano, metas: [...m.plano.metas, meta] },
  }))
  syncChild(`/${meetingId}/metas`, meta)
  return meta
}

export function patchMeta(
  meetingId: string,
  metaId: string,
  patch: Partial<Omit<Meta, 'id' | 'criadaEm'>>,
) {
  updateMeeting(meetingId, (m) => ({
    ...m,
    plano: {
      ...m.plano,
      metas: m.plano.metas.map((x) =>
        x.id === metaId ? { ...x, ...patch, atualizadaEm: nowIso() } : x,
      ),
    },
  }))
  syncChild(`/${meetingId}/metas/${metaId}`, patch, 'PATCH')
}

export function removeMeta(meetingId: string, metaId: string) {
  updateMeeting(meetingId, (m) => ({
    ...m,
    plano: {
      ...m.plano,
      metas: m.plano.metas.filter((x) => x.id !== metaId),
    },
  }))
  syncDelete(`/${meetingId}/metas/${metaId}`)
}

export function addDecisao(
  meetingId: string,
  input: Omit<Decisao, 'id' | 'criadaEm'>,
): Decisao {
  const dec: Decisao = { id: uid(), criadaEm: nowIso(), ...input }
  updateMeeting(meetingId, (m) => ({
    ...m,
    plano: { ...m.plano, decisoes: [...m.plano.decisoes, dec] },
  }))
  syncChild(`/${meetingId}/decisoes`, dec)
  return dec
}

export function patchDecisao(
  meetingId: string,
  decisaoId: string,
  patch: Partial<Omit<Decisao, 'id' | 'criadaEm'>>,
) {
  updateMeeting(meetingId, (m) => ({
    ...m,
    plano: {
      ...m.plano,
      decisoes: m.plano.decisoes.map((x) =>
        x.id === decisaoId ? { ...x, ...patch } : x,
      ),
    },
  }))
  syncChild(`/${meetingId}/decisoes/${decisaoId}`, patch, 'PATCH')
}

export function removeDecisao(meetingId: string, decisaoId: string) {
  updateMeeting(meetingId, (m) => ({
    ...m,
    plano: {
      ...m.plano,
      decisoes: m.plano.decisoes.filter((x) => x.id !== decisaoId),
    },
  }))
  syncDelete(`/${meetingId}/decisoes/${decisaoId}`)
}

export function addAcao(
  meetingId: string,
  input: Omit<Acao, 'id' | 'criadaEm' | 'atualizadaEm'>,
): Acao {
  const acao: Acao = {
    id: uid(),
    criadaEm: nowIso(),
    atualizadaEm: nowIso(),
    ...input,
  }
  updateMeeting(meetingId, (m) => ({
    ...m,
    plano: { ...m.plano, acoes: [...m.plano.acoes, acao] },
  }))
  syncChild(`/${meetingId}/acoes`, acao)
  return acao
}

export function patchAcao(
  meetingId: string,
  acaoId: string,
  patch: Partial<Omit<Acao, 'id' | 'criadaEm'>>,
) {
  updateMeeting(meetingId, (m) => ({
    ...m,
    plano: {
      ...m.plano,
      acoes: m.plano.acoes.map((x) =>
        x.id === acaoId ? { ...x, ...patch, atualizadaEm: nowIso() } : x,
      ),
    },
  }))
  syncChild(`/${meetingId}/acoes/${acaoId}`, patch, 'PATCH')
}

export function removeAcao(meetingId: string, acaoId: string) {
  updateMeeting(meetingId, (m) => ({
    ...m,
    plano: {
      ...m.plano,
      acoes: m.plano.acoes.filter((x) => x.id !== acaoId),
    },
  }))
  syncDelete(`/${meetingId}/acoes/${acaoId}`)
}

export type AcaoFlat = Acao & { meetingId: string; meetingTitulo: string }
export type MetaFlat = Meta & { meetingId: string; meetingTitulo: string }
export type DecisaoFlat = Decisao & { meetingId: string; meetingTitulo: string }

export function getAllAcoes(meetings: Meeting[]): AcaoFlat[] {
  return meetings.flatMap((m) =>
    m.plano.acoes.map((a) => ({ ...a, meetingId: m.id, meetingTitulo: m.titulo })),
  )
}

export function getAllMetas(meetings: Meeting[]): MetaFlat[] {
  return meetings.flatMap((m) =>
    m.plano.metas.map((x) => ({ ...x, meetingId: m.id, meetingTitulo: m.titulo })),
  )
}

export function getAllDecisoes(meetings: Meeting[]): DecisaoFlat[] {
  return meetings.flatMap((m) =>
    m.plano.decisoes.map((x) => ({ ...x, meetingId: m.id, meetingTitulo: m.titulo })),
  )
}

export function buildGlobalPlanContext(meetings: Meeting[]) {
  const acoes = getAllAcoes(meetings)
  const metas = getAllMetas(meetings)
  const decisoes = getAllDecisoes(meetings)
  return {
    total_reunioes: meetings.length,
    total_acoes: acoes.length,
    acoes_pendentes: acoes.filter((a) => a.status === 'pendente').length,
    acoes_em_andamento: acoes.filter((a) => a.status === 'em_andamento').length,
    acoes_concluidas: acoes.filter((a) => a.status === 'concluida').length,
    acoes_bloqueadas: acoes.filter((a) => a.status === 'bloqueada').length,
    total_metas: metas.length,
    metas_em_andamento: metas.filter((m) => m.status === 'em_andamento').length,
    metas_concluidas: metas.filter((m) => m.status === 'concluida').length,
    total_decisoes: decisoes.length,
    acoes_resumo: acoes.slice(0, 20).map((a) => ({
      titulo: a.titulo,
      orgao: a.orgao,
      responsavel: a.responsavel,
      prazo: a.prazo,
      status: a.status,
      reuniao: a.meetingTitulo,
    })),
    metas_resumo: metas.slice(0, 10).map((m) => ({
      titulo: m.titulo,
      metrica: m.metrica,
      prazo: m.prazo,
      status: m.status,
      reuniao: m.meetingTitulo,
    })),
  }
}

export function getMeetings(): Meeting[] {
  return state.meetings
}

function buildMeetingContext(meeting: Meeting) {
  const anexosResumo = meeting.anexos.map((a) => ({
    nome: a.nome,
    tipo: a.tipo,
    tamanho_bytes: a.tamanho,
    conteudo: a.ehTexto
      ? a.conteudo.slice(0, 24000)
      : `[Arquivo binário ${a.tipo || 'desconhecido'} anexado como referência — conteúdo não extraído]`,
  }))

  return {
    reuniao: {
      titulo: meeting.titulo,
      data: meeting.data,
      local: meeting.local,
      participantes: meeting.participantes,
      areas_fm: meeting.areasFM,
      status: meeting.status,
    },
    notas: meeting.notas,
    anexos: anexosResumo,
    plano: {
      metas: meeting.plano.metas,
      decisoes: meeting.plano.decisoes,
      acoes: meeting.plano.acoes,
    },
  }
}

function buildMeetingSystemPrompt(meeting: Meeting): string {
  return [
    'Você é o assistente Hórus para uma reunião CompStat Rio.',
    `Reunião: "${meeting.titulo}" em ${meeting.data || 'data não informada'}.`,
    'Use SEMPRE o contexto da reunião (notas e anexos anexados) como fonte primária.',
    'Cite o nome do anexo entre colchetes quando se basear nele, ex: [relatorio-presidente-vargas.txt].',
    'Quando faltar evidência no contexto, diga explicitamente em vez de inventar.',
    'Responda em português, conciso, com foco em decisão pública.',
  ].join(' ')
}

export async function sendMeetingMessage(meetingId: string, content: string): Promise<void> {
  const trimmed = content.trim()
  if (!trimmed || state.isSending) return
  const meeting = state.meetings.find((m) => m.id === meetingId)
  if (!meeting) return

  const userMsg: MeetingMessage = { id: uid(), role: 'user', content: trimmed, ts: nowIso() }
  updateMeeting(meetingId, (m) => ({ ...m, mensagens: [...m.mensagens, userMsg] }))
  syncChild(`/${meetingId}/messages`, userMsg)
  setState({ isSending: true, error: null })

  try {
    const updated = state.meetings.find((m) => m.id === meetingId) ?? meeting
    const url = `${apiBaseUrl.replace(/\/+$/, '')}/chat`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: updated.mensagens.map(({ role, content }) => ({ role, content })),
        context: buildMeetingContext(updated),
        system: buildMeetingSystemPrompt(updated),
      }),
    })
    if (!response.ok) {
      throw new Error(`API retornou ${response.status}`)
    }
    const data = (await response.json()) as { text?: string }
    const assistantMsg: MeetingMessage = {
      id: uid(),
      role: 'assistant',
      content: data.text || 'Sem texto na resposta do backend.',
      ts: nowIso(),
    }
    updateMeeting(meetingId, (m) => ({
      ...m,
      mensagens: [...m.mensagens, assistantMsg],
    }))
    syncChild(`/${meetingId}/messages`, assistantMsg)
    setState({ isSending: false })
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Falha ao chamar o backend.'
    setState({ isSending: false, error: message })
  }
}

export function getMeeting(id: string | null): Meeting | null {
  if (!id) return null
  return state.meetings.find((m) => m.id === id) ?? null
}

export const TEXT_MIME_PREFIXES = ['text/', 'application/json', 'application/xml']
export const TEXT_EXTENSIONS = ['.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.xml', '.log', '.yaml', '.yml']

export function isTextLike(file: File): boolean {
  if (TEXT_MIME_PREFIXES.some((p) => file.type.startsWith(p))) return true
  const lower = file.name.toLowerCase()
  return TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext))
}
