import { useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  CircleDot,
  ExternalLink,
  Filter,
  Flag,
  Gavel,
  ListChecks,
  Target,
} from 'lucide-react'

import {
  getAllAcoes,
  getAllDecisoes,
  getAllMetas,
  patchAcao,
  patchMeta,
  selectMeeting,
  useMeetings,
  type AcaoFlat,
  type AcaoStatus,
  type DecisaoFlat,
  type MetaFlat,
  type MetaStatus,
} from '../lib/meetingsStore'
import { cn } from '../lib/utils'

type Tab = 'overview' | 'acoes' | 'metas' | 'decisoes'

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
const ACAO_OPTS: AcaoStatus[] = [
  'pendente',
  'em_andamento',
  'concluida',
  'bloqueada',
  'cancelada',
]
const META_OPTS: MetaStatus[] = ['pendente', 'em_andamento', 'concluida', 'cancelada']

export function PlanningView() {
  const { meetings } = useMeetings()
  const [tab, setTab] = useState<Tab>('overview')

  const acoes = useMemo(() => getAllAcoes(meetings), [meetings])
  const metas = useMemo(() => getAllMetas(meetings), [meetings])
  const decisoes = useMemo(() => getAllDecisoes(meetings), [meetings])

  if (meetings.length === 0) {
    return (
      <div className="rounded border border-dashed border-bg-4 bg-bg-1/40 p-10 text-center">
        <ListChecks className="mx-auto size-10 text-ink-3" />
        <div className="mt-3 text-[13px] font-semibold text-ink-1">
          Sem reuniões ainda
        </div>
        <p className="mt-1 text-[11.5px] text-ink-3">
          Crie uma reunião e cadastre metas, decisões e ações para começar o
          acompanhamento.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<ListChecks className="size-3.5" />}
          label="Ações totais"
          value={acoes.length}
        />
        <StatCard
          icon={<CircleDot className="size-3.5 text-accent-orange" />}
          label="Em andamento"
          value={acoes.filter((a) => a.status === 'em_andamento').length}
        />
        <StatCard
          icon={<AlertCircle className="size-3.5 text-accent-red" />}
          label="Bloqueadas"
          value={acoes.filter((a) => a.status === 'bloqueada').length}
          accent="red"
        />
        <StatCard
          icon={<CheckCircle2 className="size-3.5 text-emerald-300" />}
          label="Concluídas"
          value={acoes.filter((a) => a.status === 'concluida').length}
          accent="emerald"
        />
      </div>

      <div className="flex items-center gap-1 border-b border-bg-4">
        {(
          [
            ['overview', 'Visão geral', <Flag key="o" className="size-3.5" />],
            ['acoes', `Ações (${acoes.length})`, <ListChecks key="a" className="size-3.5" />],
            ['metas', `Metas (${metas.length})`, <Target key="m" className="size-3.5" />],
            [
              'decisoes',
              `Decisões (${decisoes.length})`,
              <Gavel key="d" className="size-3.5" />,
            ],
          ] as const
        ).map(([k, label, icon]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k as Tab)}
            className={cn(
              'font-mono flex items-center gap-1.5 border-b-2 px-3 py-2 text-[10.5px] uppercase tracking-wider transition',
              tab === k
                ? 'border-accent-orange text-accent-orange'
                : 'border-transparent text-ink-2 hover:text-ink-1',
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? <OverviewTab acoes={acoes} metas={metas} /> : null}
      {tab === 'acoes' ? <AcoesTable acoes={acoes} /> : null}
      {tab === 'metas' ? <MetasTable metas={metas} /> : null}
      {tab === 'decisoes' ? <DecisoesTable decisoes={decisoes} /> : null}
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: number
  accent?: 'red' | 'emerald'
}) {
  return (
    <div
      className={cn(
        'rounded border px-3.5 py-2.5',
        accent === 'red'
          ? 'border-accent-red/30 bg-accent-red/5'
          : accent === 'emerald'
            ? 'border-emerald-500/30 bg-emerald-500/5'
            : 'border-bg-4 bg-bg-2',
      )}
    >
      <div className="font-mono flex items-center gap-1.5 text-[9.5px] uppercase tracking-widest text-ink-3">
        {icon}
        {label}
      </div>
      <div className="num-mono mt-1 text-[20px] font-semibold leading-tight text-ink-0">
        {value}
      </div>
    </div>
  )
}

function OverviewTab({
  acoes,
  metas,
}: {
  acoes: AcaoFlat[]
  metas: MetaFlat[]
}) {
  const byOrgao = useMemo(() => {
    const m = new Map<string, AcaoFlat[]>()
    for (const a of acoes) {
      const key = a.orgao || 'Sem órgão'
      const arr = m.get(key) ?? []
      arr.push(a)
      m.set(key, arr)
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [acoes])

  const proximas = useMemo(() => {
    const hoje = new Date().toISOString().slice(0, 10)
    return acoes
      .filter((a) => a.status !== 'concluida' && a.status !== 'cancelada' && a.prazo)
      .sort((a, b) => a.prazo.localeCompare(b.prazo))
      .slice(0, 6)
      .map((a) => ({ ...a, atrasada: a.prazo < hoje }))
  }, [acoes])

  const metasAtivas = metas.filter(
    (m) => m.status === 'em_andamento' || m.status === 'pendente',
  )

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded border border-bg-4 bg-bg-1/70">
        <div className="border-b border-bg-4 px-4 py-2.5 text-[12px] font-semibold text-ink-0">
          Próximos prazos
        </div>
        <ul className="space-y-1.5 p-3">
          {proximas.length === 0 ? (
            <li className="text-[11.5px] text-ink-3">Sem prazos pendentes.</li>
          ) : (
            proximas.map((a) => (
              <li
                key={a.id}
                className={cn(
                  'rounded border px-3 py-2 text-[11px]',
                  a.atrasada
                    ? 'border-accent-red/40 bg-accent-red/10'
                    : 'border-bg-4 bg-bg-2',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-ink-0">{a.titulo}</span>
                  <span
                    className={cn(
                      'font-mono shrink-0 text-[10px] uppercase tracking-wider',
                      a.atrasada ? 'text-accent-red' : 'text-ink-3',
                    )}
                  >
                    {a.atrasada ? 'atrasada · ' : ''}
                    {formatDate(a.prazo)}
                  </span>
                </div>
                <div className="font-mono mt-0.5 flex gap-2 text-[10px] uppercase tracking-wider text-ink-3">
                  {a.orgao ? <span>{a.orgao}</span> : null}
                  <span>·</span>
                  <span className="truncate">{a.meetingTitulo}</span>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded border border-bg-4 bg-bg-1/70">
        <div className="border-b border-bg-4 px-4 py-2.5 text-[12px] font-semibold text-ink-0">
          Carga por órgão
        </div>
        <ul className="space-y-1.5 p-3">
          {byOrgao.length === 0 ? (
            <li className="text-[11.5px] text-ink-3">Sem ações cadastradas.</li>
          ) : (
            byOrgao.map(([orgao, items]) => {
              const concl = items.filter((x) => x.status === 'concluida').length
              const pct = items.length > 0 ? Math.round((concl / items.length) * 100) : 0
              return (
                <li
                  key={orgao}
                  className="rounded border border-bg-4 bg-bg-2 px-3 py-2"
                >
                  <div className="flex items-center justify-between text-[11.5px]">
                    <span className="text-ink-0">{orgao}</span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
                      {concl}/{items.length} ({pct}%)
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded bg-bg-3">
                    <div
                      className="h-full bg-accent-orange"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              )
            })
          )}
        </ul>
      </section>

      <section className="rounded border border-bg-4 bg-bg-1/70 lg:col-span-2">
        <div className="border-b border-bg-4 px-4 py-2.5 text-[12px] font-semibold text-ink-0">
          Metas ativas
        </div>
        <ul className="space-y-1.5 p-3">
          {metasAtivas.length === 0 ? (
            <li className="text-[11.5px] text-ink-3">Sem metas em andamento.</li>
          ) : (
            metasAtivas.map((m) => (
              <li
                key={m.id}
                className="flex items-start gap-2 rounded border border-bg-4 bg-bg-2 px-3 py-2"
              >
                <Target className="mt-0.5 size-3.5 shrink-0 text-accent-orange" />
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-medium text-ink-0">{m.titulo}</div>
                  {m.metrica ? (
                    <div className="text-[11px] text-ink-2">{m.metrica}</div>
                  ) : null}
                  <div className="font-mono mt-0.5 flex flex-wrap gap-x-3 text-[10px] uppercase tracking-wider text-ink-3">
                    {m.prazo ? <span>prazo · {formatDate(m.prazo)}</span> : null}
                    <span>reunião · {m.meetingTitulo}</span>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  )
}

function AcoesTable({ acoes }: { acoes: AcaoFlat[] }) {
  const [filter, setFilter] = useState<'todas' | AcaoStatus>('todas')
  const [orgaoFilter, setOrgaoFilter] = useState('')

  const orgaos = useMemo(
    () =>
      Array.from(new Set(acoes.map((a) => a.orgao).filter(Boolean))).sort(),
    [acoes],
  )

  const filtered = useMemo(
    () =>
      acoes.filter(
        (a) =>
          (filter === 'todas' || a.status === filter) &&
          (!orgaoFilter || a.orgao === orgaoFilter),
      ),
    [acoes, filter, orgaoFilter],
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="size-3.5 text-ink-3" />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as AcaoStatus | 'todas')}
          className="font-mono cursor-pointer rounded border border-bg-4 bg-bg-2 px-2 py-1 text-[10.5px] uppercase tracking-wider text-ink-1 outline-none"
        >
          <option value="todas">Todos os status</option>
          {ACAO_OPTS.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select
          value={orgaoFilter}
          onChange={(e) => setOrgaoFilter(e.target.value)}
          className="font-mono cursor-pointer rounded border border-bg-4 bg-bg-2 px-2 py-1 text-[10.5px] uppercase tracking-wider text-ink-1 outline-none"
        >
          <option value="">Todos os órgãos</option>
          {orgaos.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
          {filtered.length} de {acoes.length}
        </span>
      </div>
      {filtered.length === 0 ? (
        <div className="rounded border border-dashed border-bg-4 bg-bg-2/40 px-3 py-6 text-center text-[11.5px] text-ink-3">
          Nenhuma ação combina com os filtros.
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-bg-4">
          <table className="w-full table-fixed text-[11px]">
            <thead className="bg-bg-2">
              <tr className="text-left text-ink-3">
                <th className="px-2.5 py-1.5 font-mono text-[9.5px] uppercase tracking-wider">
                  Ação
                </th>
                <th className="w-28 px-2.5 py-1.5 font-mono text-[9.5px] uppercase tracking-wider">
                  Órgão
                </th>
                <th className="w-36 px-2.5 py-1.5 font-mono text-[9.5px] uppercase tracking-wider">
                  Responsável
                </th>
                <th className="w-24 px-2.5 py-1.5 font-mono text-[9.5px] uppercase tracking-wider">
                  Prazo
                </th>
                <th className="w-40 px-2.5 py-1.5 font-mono text-[9.5px] uppercase tracking-wider">
                  Reunião
                </th>
                <th className="w-32 px-2.5 py-1.5 font-mono text-[9.5px] uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr
                  key={a.id}
                  className="border-t border-bg-4 align-top hover:bg-bg-2/60"
                >
                  <td className="px-2.5 py-2 text-ink-0">
                    <div className="line-clamp-2">{a.titulo}</div>
                    {a.descricao ? (
                      <div className="mt-0.5 line-clamp-2 text-[10.5px] text-ink-2">
                        {a.descricao}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-2.5 py-2 text-ink-2">{a.orgao || '—'}</td>
                  <td className="px-2.5 py-2 text-ink-2">
                    {a.responsavel || '—'}
                  </td>
                  <td className="px-2.5 py-2 font-mono text-ink-2">
                    {a.prazo ? formatDate(a.prazo) : '—'}
                  </td>
                  <td className="px-2.5 py-2">
                    <button
                      type="button"
                      onClick={() => {
                        selectMeeting(a.meetingId)
                        window.location.hash = '#/reunioes'
                      }}
                      className="flex items-center gap-1 truncate text-left text-ink-2 hover:text-accent-orange"
                      title={a.meetingTitulo}
                    >
                      <span className="truncate">{a.meetingTitulo}</span>
                      <ExternalLink className="size-2.5 shrink-0" />
                    </button>
                  </td>
                  <td className="px-2.5 py-2">
                    <select
                      value={a.status}
                      onChange={(e) =>
                        patchAcao(a.meetingId, a.id, {
                          status: e.target.value as AcaoStatus,
                        })
                      }
                      className={cn(
                        'font-mono w-full cursor-pointer rounded px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider outline-none',
                        STATUS_COLOR[a.status],
                      )}
                    >
                      {ACAO_OPTS.map((s) => (
                        <option
                          key={s}
                          value={s}
                          className="bg-bg-1 text-ink-1 normal-case"
                        >
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function MetasTable({ metas }: { metas: MetaFlat[] }) {
  if (metas.length === 0) {
    return (
      <div className="rounded border border-dashed border-bg-4 bg-bg-2/40 px-3 py-6 text-center text-[11.5px] text-ink-3">
        Nenhuma meta cadastrada.
      </div>
    )
  }
  return (
    <ul className="space-y-1.5">
      {metas.map((m) => (
        <li key={m.id} className="rounded border border-bg-4 bg-bg-2 px-3 py-2">
          <div className="flex items-start gap-2">
            <Target className="mt-0.5 size-3.5 shrink-0 text-accent-orange" />
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-medium text-ink-0">{m.titulo}</div>
              {m.metrica ? (
                <div className="text-[11px] text-ink-2">{m.metrica}</div>
              ) : null}
              <div className="font-mono mt-0.5 flex flex-wrap gap-x-3 text-[10px] uppercase tracking-wider text-ink-3">
                {m.responsavel ? <span>resp · {m.responsavel}</span> : null}
                {m.prazo ? <span>prazo · {formatDate(m.prazo)}</span> : null}
                <button
                  type="button"
                  onClick={() => {
                    selectMeeting(m.meetingId)
                    window.location.hash = '#/reunioes'
                  }}
                  className="text-ink-2 hover:text-accent-orange"
                >
                  reunião · {m.meetingTitulo}
                </button>
              </div>
            </div>
            <select
              value={m.status}
              onChange={(e) =>
                patchMeta(m.meetingId, m.id, {
                  status: e.target.value as MetaStatus,
                })
              }
              className={cn(
                'font-mono cursor-pointer rounded px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider outline-none',
                STATUS_COLOR[m.status as AcaoStatus] ?? STATUS_COLOR.pendente,
              )}
            >
              {META_OPTS.map((s) => (
                <option key={s} value={s} className="bg-bg-1 text-ink-1 normal-case">
                  {STATUS_LABEL[s as AcaoStatus]}
                </option>
              ))}
            </select>
          </div>
        </li>
      ))}
    </ul>
  )
}

function DecisoesTable({ decisoes }: { decisoes: DecisaoFlat[] }) {
  if (decisoes.length === 0) {
    return (
      <div className="rounded border border-dashed border-bg-4 bg-bg-2/40 px-3 py-6 text-center text-[11.5px] text-ink-3">
        Nenhuma decisão registrada.
      </div>
    )
  }
  return (
    <ul className="space-y-1.5">
      {decisoes.map((d) => (
        <li key={d.id} className="rounded border border-bg-4 bg-bg-2 px-3 py-2">
          <div className="flex items-start gap-2">
            <Gavel className="mt-0.5 size-3.5 shrink-0 text-accent-orange" />
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-medium text-ink-0">{d.titulo}</div>
              {d.contexto ? (
                <div className="text-[11px] text-ink-2">{d.contexto}</div>
              ) : null}
              <div className="font-mono mt-0.5 flex flex-wrap gap-x-3 text-[10px] uppercase tracking-wider text-ink-3">
                {d.responsavel ? <span>resp · {d.responsavel}</span> : null}
                <span>registrada · {formatDate(d.criadaEm.slice(0, 10))}</span>
                <button
                  type="button"
                  onClick={() => {
                    selectMeeting(d.meetingId)
                    window.location.hash = '#/reunioes'
                  }}
                  className="text-ink-2 hover:text-accent-orange"
                >
                  reunião · {d.meetingTitulo}
                </button>
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

function formatDate(iso: string): string {
  if (!iso) return ''
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

export default PlanningView
