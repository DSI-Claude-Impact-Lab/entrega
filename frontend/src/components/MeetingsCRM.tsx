import { useMemo, useState } from 'react'
import {
  CalendarDays,
  ClipboardList,
  Plus,
  Search,
  Trash2,
  Users,
} from 'lucide-react'

import {
  createMeeting,
  deleteMeeting,
  selectMeeting,
  useMeetings,
  type Meeting,
  type MeetingStatus,
} from '../lib/meetingsStore'
import { cn } from '../lib/utils'
import { MeetingDetail } from './MeetingDetail'

const STATUS_LABEL: Record<MeetingStatus, string> = {
  rascunho: 'Rascunho',
  agendada: 'Agendada',
  concluida: 'Concluída',
}

const STATUS_COLOR: Record<MeetingStatus, string> = {
  rascunho: 'bg-bg-3 text-ink-2',
  agendada: 'bg-accent-orange/15 text-accent-orange',
  concluida: 'bg-emerald-500/15 text-emerald-300',
}

export function MeetingsCRM() {
  const { meetings, selectedId } = useMeetings()
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(meetings.length === 0)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return meetings
    return meetings.filter(
      (m) =>
        m.titulo.toLowerCase().includes(q) ||
        m.notas.toLowerCase().includes(q) ||
        m.participantes.toLowerCase().includes(q),
    )
  }, [meetings, query])

  const selected = useMemo(
    () => meetings.find((m) => m.id === selectedId) ?? null,
    [meetings, selectedId],
  )

  return (
    <div className="grid h-[calc(100vh-12rem)] gap-4 lg:grid-cols-[320px_1fr]">
      <aside className="flex min-h-0 flex-col rounded border border-bg-4 bg-bg-1/70">
        <div className="border-b border-bg-4 px-3 py-2.5">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-mono text-[9.5px] uppercase tracking-widest text-ink-3">
                CRM CompStat
              </div>
              <div className="mt-0.5 text-[13px] font-semibold text-ink-0">
                Reuniões
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex items-center gap-1 rounded bg-accent-orange px-2.5 py-1.5 text-[10.5px] font-mono uppercase tracking-wider text-white transition hover:bg-accent-orange/85"
            >
              <Plus className="size-3.5" />
              Nova
            </button>
          </div>
          <div className="mt-2.5 flex items-center gap-1.5 rounded border border-bg-4 bg-bg-2 px-2 py-1.5">
            <Search className="size-3.5 text-ink-3" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar reuniões…"
              className="flex-1 bg-transparent text-[11.5px] text-ink-1 outline-none placeholder:text-ink-3"
            />
          </div>
        </div>

        <div className="scrollbar min-h-0 flex-1 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="px-3 py-8 text-center text-[11.5px] text-ink-3">
              {meetings.length === 0
                ? 'Nenhuma reunião ainda. Clique em "Nova" para começar.'
                : 'Nenhuma reunião combina com a busca.'}
            </div>
          ) : (
            <ul className="space-y-1">
              {filtered.map((m) => (
                <MeetingListItem
                  key={m.id}
                  meeting={m}
                  active={m.id === selectedId}
                  onSelect={() => {
                    selectMeeting(m.id)
                    setCreating(false)
                  }}
                  onDelete={() => {
                    if (window.confirm(`Apagar "${m.titulo}"?`)) {
                      deleteMeeting(m.id)
                    }
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      </aside>

      <section className="min-h-0">
        {creating ? (
          <NewMeetingForm
            onCancel={() => setCreating(false)}
            onCreated={() => setCreating(false)}
          />
        ) : selected ? (
          <MeetingDetail meeting={selected} />
        ) : (
          <EmptyState onCreate={() => setCreating(true)} />
        )}
      </section>
    </div>
  )
}

function MeetingListItem({
  meeting,
  active,
  onSelect,
  onDelete,
}: {
  meeting: Meeting
  active: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  return (
    <li>
      <div
        className={cn(
          'group flex cursor-pointer items-start gap-2 rounded border px-2.5 py-2 transition',
          active
            ? 'border-accent-orange/50 bg-accent-orange/10'
            : 'border-bg-4 bg-bg-2 hover:border-bg-4/60 hover:bg-bg-3',
        )}
        onClick={onSelect}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div
              className={cn(
                'font-mono shrink-0 rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider',
                STATUS_COLOR[meeting.status],
              )}
            >
              {STATUS_LABEL[meeting.status]}
            </div>
            <span className="truncate text-[12px] font-medium text-ink-0">
              {meeting.titulo}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[10.5px] text-ink-3">
            <span className="num-mono">{formatDate(meeting.data)}</span>
            <span>·</span>
            <span>
              {meeting.anexos.length} anexo{meeting.anexos.length === 1 ? '' : 's'}
            </span>
            {meeting.mensagens.length > 0 ? (
              <>
                <span>·</span>
                <span>
                  {meeting.mensagens.length} msg
                  {meeting.mensagens.length === 1 ? '' : 's'}
                </span>
              </>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="shrink-0 rounded p-1 text-ink-3 opacity-0 transition hover:bg-bg-4 hover:text-accent-red group-hover:opacity-100"
          aria-label="Apagar reunião"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </li>
  )
}

function NewMeetingForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void
  onCreated: () => void
}) {
  const [titulo, setTitulo] = useState('')
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10))
  const [local, setLocal] = useState('')
  const [participantes, setParticipantes] = useState('')
  const [notas, setNotas] = useState('')

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!titulo.trim()) return
    createMeeting({ titulo, data, local, participantes, notas })
    onCreated()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex h-full flex-col rounded border border-bg-4 bg-bg-1/70"
    >
      <div className="border-b border-bg-4 px-4 py-2.5">
        <div className="font-mono text-[9.5px] uppercase tracking-widest text-ink-3">
          Nova reunião
        </div>
        <div className="mt-0.5 text-[13px] font-semibold text-ink-0">
          Cadastro
        </div>
      </div>
      <div className="scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <Field label="Título" required>
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ex.: CompStat semanal — Centro"
            className={INPUT_CLS}
            autoFocus
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Data">
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className={INPUT_CLS}
            />
          </Field>
          <Field label="Local">
            <input
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              placeholder="Ex.: Sala CompStat — Cidade Nova"
              className={INPUT_CLS}
            />
          </Field>
        </div>
        <Field label="Participantes">
          <input
            value={participantes}
            onChange={(e) => setParticipantes(e.target.value)}
            placeholder="Subprefeitos, gestores, comandantes…"
            className={INPUT_CLS}
          />
        </Field>
        <Field label="Notas iniciais">
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Agenda, objetivos, áreas a discutir…"
            rows={5}
            className={cn(INPUT_CLS, 'min-h-28 resize-y')}
          />
        </Field>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-bg-4 px-4 py-3">
        <button
          type="button"
          onClick={onCancel}
          className="font-mono rounded border border-bg-4 bg-bg-2 px-3 py-1.5 text-[10.5px] uppercase tracking-wider text-ink-2 hover:bg-bg-3"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!titulo.trim()}
          className="font-mono flex items-center gap-1.5 rounded bg-accent-orange px-3 py-1.5 text-[10.5px] uppercase tracking-wider text-white hover:bg-accent-orange/85 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="size-3.5" />
          Criar reunião
        </button>
      </div>
    </form>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded border border-dashed border-bg-4 bg-bg-1/40 p-10 text-center">
      <ClipboardList className="size-10 text-ink-3" />
      <div className="mt-3 text-[13px] font-semibold text-ink-1">
        Selecione ou crie uma reunião
      </div>
      <p className="mt-1 max-w-md text-[11.5px] text-ink-3">
        Cada reunião agrega notas, anexos (relatórios, transcrições, dossiês) e o
        chat usa esse conteúdo como contexto exclusivo da reunião.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="font-mono mt-4 flex items-center gap-1.5 rounded bg-accent-orange px-3 py-1.5 text-[10.5px] uppercase tracking-wider text-white hover:bg-accent-orange/85"
      >
        <Plus className="size-3.5" />
        Nova reunião
      </button>
      <div className="mt-6 grid grid-cols-3 gap-3 text-left text-[11px] text-ink-3 sm:max-w-lg">
        <Tip icon={<CalendarDays className="size-3.5" />}>
          Histórico de reuniões CompStat
        </Tip>
        <Tip icon={<Users className="size-3.5" />}>
          Participantes e áreas FM associadas
        </Tip>
        <Tip icon={<ClipboardList className="size-3.5" />}>
          Anexos viram contexto do chat
        </Tip>
      </div>
    </div>
  )
}

function Tip({
  icon,
  children,
}: {
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded border border-bg-4 bg-bg-2 p-2">
      <div className="text-accent-orange">{icon}</div>
      <div className="mt-1 leading-4">{children}</div>
    </div>
  )
}

const INPUT_CLS =
  'w-full rounded border border-bg-4 bg-bg-2 px-3 py-2 text-[12px] text-ink-1 outline-none placeholder:text-ink-3 focus:border-accent-orange/60 focus:ring-1 focus:ring-accent-orange/40'

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="grid gap-1.5">
      <span className="font-mono text-[9.5px] uppercase tracking-widest text-ink-3">
        {label}
        {required ? <span className="text-accent-orange"> *</span> : null}
      </span>
      {children}
    </label>
  )
}

function formatDate(iso: string): string {
  if (!iso) return 'sem data'
  try {
    const d = new Date(`${iso}T00:00:00`)
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: '2-digit',
    })
  } catch {
    return iso
  }
}

export default MeetingsCRM
