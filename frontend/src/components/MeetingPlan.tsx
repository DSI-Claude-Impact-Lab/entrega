import { useState } from 'react'
import {
  CheckCircle2,
  CircleDot,
  Flag,
  Gavel,
  ListChecks,
  Pause,
  Plus,
  Target,
  X,
} from 'lucide-react'

import {
  addAcao,
  addDecisao,
  addMeta,
  patchAcao,
  patchMeta,
  removeAcao,
  removeDecisao,
  removeMeta,
  type Acao,
  type AcaoStatus,
  type Meeting,
  type MetaStatus,
} from '../lib/meetingsStore'
import { cn } from '../lib/utils'

type Tab = 'metas' | 'decisoes' | 'acoes'

const TAB_LABELS: Record<Tab, string> = {
  metas: 'Metas',
  decisoes: 'Decisões',
  acoes: 'Ações',
}

const TAB_ICONS: Record<Tab, React.ReactNode> = {
  metas: <Target className="size-3.5" />,
  decisoes: <Gavel className="size-3.5" />,
  acoes: <ListChecks className="size-3.5" />,
}

const ACAO_STATUS_OPTS: AcaoStatus[] = [
  'pendente',
  'em_andamento',
  'concluida',
  'bloqueada',
  'cancelada',
]
const META_STATUS_OPTS: MetaStatus[] = [
  'pendente',
  'em_andamento',
  'concluida',
  'cancelada',
]
const STATUS_LABEL: Record<AcaoStatus, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  bloqueada: 'Bloqueada',
  cancelada: 'Cancelada',
}
const STATUS_COLOR: Record<AcaoStatus, string> = {
  pendente: 'bg-bg-3 text-ink-2',
  em_andamento: 'bg-accent-orange/15 text-accent-orange',
  concluida: 'bg-emerald-500/15 text-emerald-300',
  bloqueada: 'bg-accent-red/15 text-accent-red',
  cancelada: 'bg-bg-3 text-ink-3 line-through',
}

export function MeetingPlan({ meeting }: { meeting: Meeting }) {
  const [tab, setTab] = useState<Tab>('acoes')
  const counts = {
    metas: meeting.plano.metas.length,
    decisoes: meeting.plano.decisoes.length,
    acoes: meeting.plano.acoes.length,
  }

  return (
    <section className="flex min-h-0 flex-col rounded border border-bg-4 bg-bg-1/70">
      <div className="border-b border-bg-4 px-4 py-2.5">
        <div className="font-mono text-[9.5px] uppercase tracking-widest text-ink-3">
          Saída
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[13px] font-semibold text-ink-0">
          <Flag className="size-3.5 text-accent-orange" />
          Plano de ação
        </div>
        <div className="mt-2 flex items-center gap-1">
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'font-mono flex items-center gap-1.5 rounded px-2.5 py-1 text-[10.5px] uppercase tracking-wider transition',
                tab === t
                  ? 'bg-accent-orange/15 text-accent-orange'
                  : 'text-ink-2 hover:bg-bg-3 hover:text-ink-1',
              )}
            >
              {TAB_ICONS[t]}
              {TAB_LABELS[t]} <span className="text-ink-3">{counts[t]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="scrollbar min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'metas' ? <MetasTab meeting={meeting} /> : null}
        {tab === 'decisoes' ? <DecisoesTab meeting={meeting} /> : null}
        {tab === 'acoes' ? <AcoesTab meeting={meeting} /> : null}
      </div>
    </section>
  )
}

function AcoesTab({ meeting }: { meeting: Meeting }) {
  const [adding, setAdding] = useState(meeting.plano.acoes.length === 0)
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [orgao, setOrgao] = useState('')
  const [responsavel, setResponsavel] = useState('')
  const [prazo, setPrazo] = useState(() => addDays(new Date(), 14))
  const [areaFM, setAreaFM] = useState('')

  function save() {
    if (!titulo.trim()) return
    addAcao(meeting.id, {
      titulo: titulo.trim(),
      descricao: descricao.trim(),
      orgao: orgao.trim(),
      responsavel: responsavel.trim(),
      prazo,
      areaFM: areaFM.trim(),
      status: 'pendente',
    })
    setTitulo('')
    setDescricao('')
    setOrgao('')
    setResponsavel('')
    setAreaFM('')
    setAdding(false)
  }

  return (
    <div className="space-y-2">
      {adding ? (
        <div className="space-y-2 rounded border border-accent-orange/30 bg-bg-2/40 p-3">
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Título da ação (ex.: Substituir 12 luminárias na Pres. Vargas)"
            className={INPUT_CLS}
            autoFocus
          />
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Descrição / critério de aceite"
            rows={2}
            className={cn(INPUT_CLS, 'resize-y')}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={orgao}
              onChange={(e) => setOrgao(e.target.value)}
              placeholder="Órgão (RioLuz, COMLURB, SEOP…)"
              className={INPUT_CLS}
            />
            <input
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
              placeholder="Responsável"
              className={INPUT_CLS}
            />
            <input
              type="date"
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
              className={INPUT_CLS}
            />
            <input
              value={areaFM}
              onChange={(e) => setAreaFM(e.target.value)}
              placeholder="Área FM alvo (opcional)"
              className={INPUT_CLS}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="font-mono rounded border border-bg-4 bg-bg-1 px-2.5 py-1 text-[10px] uppercase tracking-wider text-ink-2 hover:bg-bg-3"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!titulo.trim()}
              className="font-mono rounded bg-accent-orange px-2.5 py-1 text-[10px] uppercase tracking-wider text-white hover:bg-accent-orange/85 disabled:opacity-50"
            >
              Adicionar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="font-mono flex w-full items-center justify-center gap-1.5 rounded border border-dashed border-bg-4 bg-bg-2/40 px-2 py-2 text-[10.5px] uppercase tracking-wider text-ink-2 hover:bg-bg-3 hover:text-ink-1"
        >
          <Plus className="size-3.5" />
          Nova ação
        </button>
      )}

      {meeting.plano.acoes.length === 0 ? (
        <div className="rounded border border-dashed border-bg-4 bg-bg-2/20 px-3 py-4 text-center text-[11px] text-ink-3">
          Nenhuma ação ainda. Decisões da reunião viram ações com órgão,
          responsável e prazo.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {meeting.plano.acoes.map((a) => (
            <AcaoRow
              key={a.id}
              meetingId={meeting.id}
              acao={a}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function AcaoRow({ meetingId, acao }: { meetingId: string; acao: Acao }) {
  const status = acao.status
  return (
    <li className="rounded border border-bg-4 bg-bg-2 px-3 py-2">
      <div className="flex items-start gap-2">
        <StatusIcon status={status} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-ink-0">{acao.titulo}</span>
            {acao.orgao ? (
              <span className="font-mono shrink-0 rounded bg-bg-3 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-ink-2">
                {acao.orgao}
              </span>
            ) : null}
          </div>
          {acao.descricao ? (
            <div className="mt-0.5 text-[11px] text-ink-2">{acao.descricao}</div>
          ) : null}
          <div className="font-mono mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] uppercase tracking-wider text-ink-3">
            {acao.responsavel ? <span>resp · {acao.responsavel}</span> : null}
            {acao.prazo ? <span>prazo · {formatDate(acao.prazo)}</span> : null}
            {acao.areaFM ? <span>área · {acao.areaFM}</span> : null}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <select
            value={status}
            onChange={(e) =>
              patchAcao(meetingId, acao.id, { status: e.target.value as AcaoStatus })
            }
            className={cn(
              'font-mono cursor-pointer rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider outline-none',
              STATUS_COLOR[status],
            )}
          >
            {ACAO_STATUS_OPTS.map((s) => (
              <option key={s} value={s} className="bg-bg-1 text-ink-1 normal-case">
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Remover "${acao.titulo}"?`)) {
                removeAcao(meetingId, acao.id)
              }
            }}
            className="rounded p-1 text-ink-3 hover:bg-bg-4 hover:text-accent-red"
            aria-label="Remover ação"
          >
            <X className="size-3" />
          </button>
        </div>
      </div>
    </li>
  )
}

function MetasTab({ meeting }: { meeting: Meeting }) {
  const [adding, setAdding] = useState(meeting.plano.metas.length === 0)
  const [titulo, setTitulo] = useState('')
  const [metrica, setMetrica] = useState('')
  const [responsavel, setResponsavel] = useState('')
  const [prazo, setPrazo] = useState(() => addDays(new Date(), 90))

  function save() {
    if (!titulo.trim()) return
    addMeta(meeting.id, {
      titulo: titulo.trim(),
      metrica: metrica.trim(),
      responsavel: responsavel.trim(),
      prazo,
      status: 'em_andamento',
    })
    setTitulo('')
    setMetrica('')
    setResponsavel('')
    setAdding(false)
  }

  return (
    <div className="space-y-2">
      {adding ? (
        <div className="space-y-2 rounded border border-accent-orange/30 bg-bg-2/40 p-3">
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Meta (ex.: Reduzir roubo a transeunte em Pres. Vargas)"
            className={INPUT_CLS}
            autoFocus
          />
          <input
            value={metrica}
            onChange={(e) => setMetrica(e.target.value)}
            placeholder="Métrica & alvo (ex.: -20% em 90 dias vs baseline)"
            className={INPUT_CLS}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
              placeholder="Responsável"
              className={INPUT_CLS}
            />
            <input
              type="date"
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
              className={INPUT_CLS}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="font-mono rounded border border-bg-4 bg-bg-1 px-2.5 py-1 text-[10px] uppercase tracking-wider text-ink-2 hover:bg-bg-3"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!titulo.trim()}
              className="font-mono rounded bg-accent-orange px-2.5 py-1 text-[10px] uppercase tracking-wider text-white hover:bg-accent-orange/85 disabled:opacity-50"
            >
              Adicionar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="font-mono flex w-full items-center justify-center gap-1.5 rounded border border-dashed border-bg-4 bg-bg-2/40 px-2 py-2 text-[10.5px] uppercase tracking-wider text-ink-2 hover:bg-bg-3 hover:text-ink-1"
        >
          <Plus className="size-3.5" />
          Nova meta
        </button>
      )}
      {meeting.plano.metas.length === 0 ? (
        <div className="rounded border border-dashed border-bg-4 bg-bg-2/20 px-3 py-4 text-center text-[11px] text-ink-3">
          Nenhuma meta. Métricas SMART de longo prazo (volumetria, redução,
          cobertura, qualidade…).
        </div>
      ) : (
        <ul className="space-y-1.5">
          {meeting.plano.metas.map((m) => (
            <li key={m.id} className="rounded border border-bg-4 bg-bg-2 px-3 py-2">
              <div className="flex items-start gap-2">
                <Target className="mt-0.5 size-3.5 shrink-0 text-accent-orange" />
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-medium text-ink-0">{m.titulo}</div>
                  {m.metrica ? (
                    <div className="mt-0.5 text-[11px] text-ink-2">{m.metrica}</div>
                  ) : null}
                  <div className="font-mono mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] uppercase tracking-wider text-ink-3">
                    {m.responsavel ? <span>resp · {m.responsavel}</span> : null}
                    {m.prazo ? <span>prazo · {formatDate(m.prazo)}</span> : null}
                  </div>
                </div>
                <select
                  value={m.status}
                  onChange={(e) =>
                    patchMeta(meeting.id, m.id, {
                      status: e.target.value as MetaStatus,
                    })
                  }
                  className={cn(
                    'font-mono cursor-pointer rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider outline-none',
                    STATUS_COLOR[m.status],
                  )}
                >
                  {META_STATUS_OPTS.map((s) => (
                    <option key={s} value={s} className="bg-bg-1 text-ink-1 normal-case">
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Remover meta "${m.titulo}"?`)) {
                      removeMeta(meeting.id, m.id)
                    }
                  }}
                  className="rounded p-1 text-ink-3 hover:bg-bg-4 hover:text-accent-red"
                  aria-label="Remover meta"
                >
                  <X className="size-3" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function DecisoesTab({ meeting }: { meeting: Meeting }) {
  const [adding, setAdding] = useState(meeting.plano.decisoes.length === 0)
  const [titulo, setTitulo] = useState('')
  const [contexto, setContexto] = useState('')
  const [responsavel, setResponsavel] = useState('')

  function save() {
    if (!titulo.trim()) return
    addDecisao(meeting.id, {
      titulo: titulo.trim(),
      contexto: contexto.trim(),
      responsavel: responsavel.trim(),
    })
    setTitulo('')
    setContexto('')
    setResponsavel('')
    setAdding(false)
  }

  return (
    <div className="space-y-2">
      {adding ? (
        <div className="space-y-2 rounded border border-accent-orange/30 bg-bg-2/40 p-3">
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Decisão (ex.: Antecipar substituição das luminárias para próxima semana)"
            className={INPUT_CLS}
            autoFocus
          />
          <textarea
            value={contexto}
            onChange={(e) => setContexto(e.target.value)}
            placeholder="Contexto / racional"
            rows={2}
            className={cn(INPUT_CLS, 'resize-y')}
          />
          <input
            value={responsavel}
            onChange={(e) => setResponsavel(e.target.value)}
            placeholder="Quem decidiu / responsável"
            className={INPUT_CLS}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="font-mono rounded border border-bg-4 bg-bg-1 px-2.5 py-1 text-[10px] uppercase tracking-wider text-ink-2 hover:bg-bg-3"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!titulo.trim()}
              className="font-mono rounded bg-accent-orange px-2.5 py-1 text-[10px] uppercase tracking-wider text-white hover:bg-accent-orange/85 disabled:opacity-50"
            >
              Registrar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="font-mono flex w-full items-center justify-center gap-1.5 rounded border border-dashed border-bg-4 bg-bg-2/40 px-2 py-2 text-[10.5px] uppercase tracking-wider text-ink-2 hover:bg-bg-3 hover:text-ink-1"
        >
          <Plus className="size-3.5" />
          Nova decisão
        </button>
      )}
      {meeting.plano.decisoes.length === 0 ? (
        <div className="rounded border border-dashed border-bg-4 bg-bg-2/20 px-3 py-4 text-center text-[11px] text-ink-3">
          Nenhuma decisão registrada. Registre o que foi acordado para que as
          ações tenham rastro.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {meeting.plano.decisoes.map((d) => (
            <li key={d.id} className="rounded border border-bg-4 bg-bg-2 px-3 py-2">
              <div className="flex items-start gap-2">
                <Gavel className="mt-0.5 size-3.5 shrink-0 text-accent-orange" />
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-medium text-ink-0">{d.titulo}</div>
                  {d.contexto ? (
                    <div className="mt-0.5 text-[11px] text-ink-2">{d.contexto}</div>
                  ) : null}
                  <div className="font-mono mt-1 flex flex-wrap gap-x-3 text-[10px] uppercase tracking-wider text-ink-3">
                    {d.responsavel ? <span>resp · {d.responsavel}</span> : null}
                    <span>registrada · {formatDate(d.criadaEm.slice(0, 10))}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Remover decisão "${d.titulo}"?`)) {
                      removeDecisao(meeting.id, d.id)
                    }
                  }}
                  className="rounded p-1 text-ink-3 hover:bg-bg-4 hover:text-accent-red"
                  aria-label="Remover decisão"
                >
                  <X className="size-3" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function StatusIcon({ status }: { status: AcaoStatus }) {
  if (status === 'concluida') return <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
  if (status === 'bloqueada') return <Pause className="mt-0.5 size-3.5 shrink-0 text-accent-red" />
  if (status === 'em_andamento') return <CircleDot className="mt-0.5 size-3.5 shrink-0 text-accent-orange" />
  return <CircleDot className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
}

const INPUT_CLS =
  'w-full rounded border border-bg-4 bg-bg-1 px-2.5 py-1.5 text-[11.5px] text-ink-1 outline-none placeholder:text-ink-3 focus:border-accent-orange/60 focus:ring-1 focus:ring-accent-orange/40'

function addDays(date: Date, days: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function formatDate(iso: string): string {
  if (!iso) return ''
  try {
    const d = new Date(`${iso}T00:00:00`)
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  } catch {
    return iso
  }
}

export default MeetingPlan
