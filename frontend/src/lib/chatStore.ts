import { useSyncExternalStore } from 'react'

import { buildGlobalPlanContext, getMeetings } from './meetingsStore'

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type ChatState = {
  messages: ChatMessage[]
  systemPrompt: string
  isSending: boolean
  error: string | null
  lastReadCount: number
}

const DEFAULT_SYSTEM_PROMPT =
  'Você é o assistente Hórus de decisão pública para o CompStat Rio. ' +
  'Responda em português, use o contexto do mapa e dos dados da aplicação, ' +
  'não invente dados ausentes, e deixe claro quais evidências sustentam a recomendação.'

const INITIAL_GREETING: ChatMessage = {
  role: 'assistant',
  content:
    'Pronto para discutir a análise CompStat. Quando os dados da área estiverem conectados, vou usar esse contexto para responder.',
}

let state: ChatState = {
  messages: [INITIAL_GREETING],
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  isSending: false,
  error: null,
  lastReadCount: 1,
}

const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function setState(patch: Partial<ChatState>) {
  state = { ...state, ...patch }
  emit()
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '/api').toString()

// Ambient context shared between the UI and chat. Components that own
// app state (e.g. the map) call `setChatContext` whenever their state
// changes, so a question fired from any chat surface always carries the
// latest snapshot.
let ambientContext: unknown = null

export function setChatContext(context: unknown): void {
  ambientContext = context
}

export function getChatContext(): unknown {
  return ambientContext
}

export async function sendMessage(content: string, context?: unknown): Promise<void> {
  const trimmed = content.trim()
  if (!trimmed || state.isSending) return
  const next: ChatMessage[] = [...state.messages, { role: 'user', content: trimmed }]
  setState({ messages: next, isSending: true, error: null })
  try {
    const url = `${apiBaseUrl.replace(/\/+$/, '')}/chat`
    const baseContext = context ?? ambientContext ?? {}
    const planoGlobal = buildGlobalPlanContext(getMeetings())
    const payloadContext =
      baseContext && typeof baseContext === 'object'
        ? { ...(baseContext as Record<string, unknown>), plano_global: planoGlobal }
        : { contexto: baseContext, plano_global: planoGlobal }
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: next.slice(1),
        context: payloadContext,
        system: state.systemPrompt,
      }),
    })
    if (!response.ok) {
      throw new Error(`API retornou ${response.status}`)
    }
    const data = (await response.json()) as { text?: string }
    setState({
      messages: [
        ...next,
        {
          role: 'assistant',
          content: data.text || 'Sem texto na resposta do backend.',
        },
      ],
      isSending: false,
    })
  } catch (caught) {
    const message =
      caught instanceof Error ? caught.message : 'Falha ao chamar o backend.'
    setState({ isSending: false, error: message })
  }
}

export function setSystemPrompt(prompt: string) {
  setState({ systemPrompt: prompt })
}

export function markChatRead() {
  setState({ lastReadCount: state.messages.length })
}

export function clearChatError() {
  setState({ error: null })
}

export function useChat(): ChatState {
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

export function getApiBaseUrl(): string {
  return apiBaseUrl
}
