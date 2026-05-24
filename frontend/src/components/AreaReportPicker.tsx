import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, FileText, LoaderCircle, RefreshCw } from 'lucide-react'

import { api, type AreaFM, type AreaReport } from '../lib/api'
import { formatAreaReportMarkdown, reportFileName } from '../lib/areaReport'
import { cn } from '../lib/utils'

type ReportCache = Record<string, AreaReport>

export function AreaReportPicker({
  onAttach,
  onCancel,
}: {
  onAttach: (input: { nome: string; conteudo: string }) => void
  onCancel: () => void
}) {
  const [areas, setAreas] = useState<AreaFM[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reports, setReports] = useState<ReportCache>({})
  const [reportLoading, setReportLoading] = useState(false)

  async function loadAreas() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.areasFm()
      const sorted = [...(data.items ?? [])].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      setAreas(sorted)
      if (sorted.length > 0 && !selectedId) setSelectedId(sorted[0].id)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao buscar áreas FM.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    queueMicrotask(() => void loadAreas())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedId || reports[selectedId]) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setReportLoading(true)
      setError(null)
      api
        .areaReport(selectedId)
        .then((r) => {
          if (cancelled) return
          setReports((prev) => ({ ...prev, [selectedId]: r }))
        })
        .catch((caught) => {
          if (cancelled) return
          setError(caught instanceof Error ? caught.message : 'Falha ao buscar relatório.')
        })
        .finally(() => {
          if (!cancelled) setReportLoading(false)
        })
    })
    return () => {
      cancelled = true
    }
  }, [selectedId, reports])

  const selected = selectedId ? reports[selectedId] : null
  const preview = useMemo(() => (selected ? formatAreaReportMarkdown(selected) : ''), [selected])

  return (
    <div className="space-y-2 border-b border-bg-4 bg-bg-2/40 p-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-[9.5px] uppercase tracking-widest text-ink-3">
            Gerador
          </div>
          <div className="text-[12px] font-semibold text-ink-0">
            Relatório de área FM
          </div>
        </div>
        <button
          type="button"
          onClick={loadAreas}
          disabled={loading}
          className="font-mono flex items-center gap-1 rounded border border-bg-4 bg-bg-1 px-2 py-1 text-[10px] uppercase tracking-wider text-ink-2 hover:bg-bg-3 disabled:opacity-50"
        >
          <RefreshCw className={cn('size-3', loading && 'animate-spin')} />
          Atualizar
        </button>
      </div>

      {error ? (
        <div className="font-mono rounded border border-accent-red/40 bg-accent-red/10 px-2 py-1.5 text-[10.5px] text-accent-red">
          {error}
        </div>
      ) : null}

      {!areas && loading ? (
        <div className="flex items-center gap-2 px-1 py-3 text-[11.5px] text-ink-3">
          <LoaderCircle className="size-3.5 animate-spin text-accent-orange" />
          Buscando áreas FM…
        </div>
      ) : null}

      {areas && areas.length > 0 ? (
        <div className="grid gap-2 lg:grid-cols-[1fr_1.4fr]">
          <ul className="scrollbar max-h-64 space-y-1 overflow-y-auto rounded border border-bg-4 bg-bg-1 p-1.5">
            {areas.map((a, i) => {
              const active = a.id === selectedId
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(a.id)}
                    className={cn(
                      'flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-[11px] transition',
                      active
                        ? 'bg-accent-orange/15 text-ink-0 ring-1 ring-accent-orange/40'
                        : 'text-ink-1 hover:bg-bg-3',
                    )}
                  >
                    <span className="font-mono shrink-0 text-[9.5px] uppercase tracking-wider text-ink-3">
                      #{String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{a.name}</span>
                      <span className="font-mono mt-0.5 block text-[9.5px] uppercase tracking-wider text-ink-3">
                        {a.n_ocorrencias.toLocaleString('pt-BR')} ocs · score{' '}
                        {(a.score * 100).toFixed(0)}
                      </span>
                    </span>
                    <ChevronRight
                      className={cn(
                        'size-3 shrink-0 self-center transition',
                        active ? 'text-accent-orange' : 'text-ink-3',
                      )}
                    />
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="flex min-h-0 flex-col rounded border border-bg-4 bg-bg-1">
            <div className="flex items-center justify-between border-b border-bg-4 px-2.5 py-1.5">
              <div className="flex items-center gap-1.5 text-[11px] text-ink-1">
                <FileText className="size-3.5 text-accent-orange" />
                <span className="truncate">
                  {selected ? selected.name : reportLoading ? 'Carregando…' : '—'}
                </span>
              </div>
              {reportLoading ? (
                <LoaderCircle className="size-3 animate-spin text-accent-orange" />
              ) : null}
            </div>
            <pre className="scrollbar max-h-56 flex-1 overflow-y-auto whitespace-pre-wrap break-words p-2.5 text-[10.5px] leading-4 text-ink-2">
              {preview || 'Selecione uma área para gerar o relatório.'}
            </pre>
          </div>
        </div>
      ) : null}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="font-mono rounded border border-bg-4 bg-bg-1 px-2.5 py-1 text-[10px] uppercase tracking-wider text-ink-2 hover:bg-bg-3"
        >
          Fechar
        </button>
        <button
          type="button"
          disabled={!selected}
          onClick={() => {
            if (!selected) return
            onAttach({
              nome: reportFileName(selected),
              conteudo: formatAreaReportMarkdown(selected),
            })
          }}
          className="font-mono flex items-center gap-1.5 rounded bg-accent-orange px-2.5 py-1 text-[10px] uppercase tracking-wider text-white hover:bg-accent-orange/85 disabled:opacity-50"
        >
          <FileText className="size-3" />
          Anexar à reunião
        </button>
      </div>
    </div>
  )
}

export default AreaReportPicker
