import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  CalendarDays,
  ChevronRight,
  Download,
  FileText,
  LoaderCircle,
  MapPin,
  Paperclip,
  Save,
  Sparkles,
  Users,
  X,
} from 'lucide-react'

import {
  addAttachment,
  isTextLike,
  patchMeeting,
  removeAttachment,
  type Meeting,
  type MeetingAttachment,
  type MeetingStatus,
} from '../lib/meetingsStore'
import { api, type AreaFM } from '../lib/api'
import { reportFileName } from '../lib/areaReport'
import { blobToDataUrl, buildAreaReportDocxBlob } from '../lib/areaReportDocx'
import { cn } from '../lib/utils'
import { FloatingMeetingChat } from './FloatingMeetingChat'
import { MeetingPlan } from './MeetingPlan'

type AttachmentKind = 'text' | 'pdf' | 'image' | 'docx' | 'other'

function attachmentKind(a: MeetingAttachment): AttachmentKind {
  if (a.ehTexto) return 'text'
  const name = (a.nome || '').toLowerCase()
  const tipo = (a.tipo || '').toLowerCase()
  if (tipo === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (tipo.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/.test(name)) return 'image'
  if (name.endsWith('.docx') || tipo.includes('wordprocessingml')) return 'docx'
  return 'other'
}

function downloadAttachment(a: MeetingAttachment) {
  if (!a.conteudo) return
  const link = document.createElement('a')
  link.href = a.conteudo
  link.download = a.nome
  link.click()
}

const MAX_TEXT_BYTES = 1_000_000
const STATUS_OPTIONS: MeetingStatus[] = ['rascunho', 'agendada', 'concluida']
const STATUS_LABEL: Record<MeetingStatus, string> = {
  rascunho: 'Rascunho',
  agendada: 'Agendada',
  concluida: 'Concluída',
}

export function MeetingDetail({ meeting }: { meeting: Meeting }) {
  const [reportModalOpen, setReportModalOpen] = useState(false)
  const [viewerAttachment, setViewerAttachment] =
    useState<MeetingAttachment | null>(null)

  function openAttachment(a: MeetingAttachment) {
    const kind = attachmentKind(a)
    if (kind === 'docx') {
      downloadAttachment(a)
      return
    }
    setViewerAttachment(a)
  }

  return (
    <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[1fr_1fr]">
      <div className="flex min-h-0 flex-col gap-4">
        <MeetingHeader
          key={`header-${meeting.id}`}
          meeting={meeting}
          onGenerateReport={() => setReportModalOpen(true)}
        />
        <MeetingNotes key={`notes-${meeting.id}`} meeting={meeting} />
        <MeetingAttachments meeting={meeting} onOpen={openAttachment} />
      </div>
      <MeetingPlan meeting={meeting} />
      <FloatingMeetingChat key={`chat-${meeting.id}`} meeting={meeting} />

      {reportModalOpen ? (
        <ReportGenerationModal
          meetingId={meeting.id}
          onClose={() => setReportModalOpen(false)}
        />
      ) : null}
      {viewerAttachment ? (
        <AttachmentViewerModal
          attachment={viewerAttachment}
          onClose={() => setViewerAttachment(null)}
          onDownload={() => downloadAttachment(viewerAttachment)}
        />
      ) : null}
    </div>
  )
}

function MeetingHeader({
  meeting,
  onGenerateReport,
}: {
  meeting: Meeting
  onGenerateReport: () => void
}) {
  const [titulo, setTitulo] = useState(meeting.titulo)
  const [data, setData] = useState(meeting.data)
  const [local, setLocal] = useState(meeting.local)
  const [participantes, setParticipantes] = useState(meeting.participantes)
  const [status, setStatus] = useState<MeetingStatus>(meeting.status)
  const [dirty, setDirty] = useState(false)

  function save() {
    patchMeeting(meeting.id, { titulo, data, local, participantes, status })
    setDirty(false)
  }

  return (
    <section className="rounded border border-bg-4 bg-bg-1/70">
      <div className="border-b border-bg-4 px-4 py-2.5">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-[9.5px] uppercase tracking-widest text-ink-3">
              Reunião
            </div>
            <div className="mt-0.5 text-[13px] font-semibold text-ink-0">
              Detalhes
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onGenerateReport}
              className="font-mono flex items-center gap-1.5 rounded border border-accent-orange/50 bg-accent-orange/15 px-2.5 py-1 text-[10px] uppercase tracking-wider text-accent-orange hover:bg-accent-orange/25"
            >
              <Sparkles className="size-3" />
              Gerar relatório
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!dirty}
              className="font-mono flex items-center gap-1.5 rounded border border-bg-4 bg-bg-2 px-2.5 py-1 text-[10px] uppercase tracking-wider text-ink-2 hover:bg-bg-3 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Save className="size-3" />
              Salvar
            </button>
          </div>
        </div>
      </div>
      <div className="grid gap-3 p-3 sm:grid-cols-2">
        <Field label="Título" full>
          <input
            value={titulo}
            onChange={(e) => {
              setTitulo(e.target.value)
              setDirty(true)
            }}
            onBlur={save}
            className={INPUT_CLS}
          />
        </Field>
        <Field label="Data" icon={<CalendarDays className="size-3" />}>
          <input
            type="date"
            value={data}
            onChange={(e) => {
              setData(e.target.value)
              setDirty(true)
            }}
            onBlur={save}
            className={INPUT_CLS}
          />
        </Field>
        <Field label="Status">
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as MeetingStatus)
              setDirty(true)
              patchMeeting(meeting.id, {
                status: e.target.value as MeetingStatus,
              })
            }}
            className={INPUT_CLS}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Local" icon={<MapPin className="size-3" />}>
          <input
            value={local}
            onChange={(e) => {
              setLocal(e.target.value)
              setDirty(true)
            }}
            onBlur={save}
            className={INPUT_CLS}
          />
        </Field>
        <Field
          label="Participantes"
          icon={<Users className="size-3" />}
          full
        >
          <input
            value={participantes}
            onChange={(e) => {
              setParticipantes(e.target.value)
              setDirty(true)
            }}
            onBlur={save}
            className={INPUT_CLS}
          />
        </Field>
      </div>
    </section>
  )
}

function MeetingNotes({ meeting }: { meeting: Meeting }) {
  const [notas, setNotas] = useState(meeting.notas)

  return (
    <section className="flex min-h-0 flex-col rounded border border-bg-4 bg-bg-1/70">
      <div className="border-b border-bg-4 px-4 py-2.5">
        <div className="font-mono text-[9.5px] uppercase tracking-widest text-ink-3">
          Contexto
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[13px] font-semibold text-ink-0">
          <FileText className="size-3.5 text-accent-orange" />
          Notas
        </div>
      </div>
      <textarea
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        onBlur={() => patchMeeting(meeting.id, { notas })}
        placeholder="Agenda, decisões, próximos passos…"
        className="scrollbar min-h-[120px] flex-1 resize-y bg-transparent p-4 text-[12px] leading-5 text-ink-1 outline-none placeholder:text-ink-3"
      />
    </section>
  )
}

function MeetingAttachments({
  meeting,
  onOpen,
}: {
  meeting: Meeting
  onOpen: (a: MeetingAttachment) => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [pasting, setPasting] = useState(false)
  const [pasteName, setPasteName] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [busy, setBusy] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setBusy(true)
    setErrMsg(null)
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_TEXT_BYTES) {
          setErrMsg(`"${file.name}" excede o limite de 1 MB. Use um trecho menor.`)
          continue
        }
        const ehTexto = isTextLike(file)
        let conteudo = ''
        if (ehTexto) {
          conteudo = await file.text()
        } else {
          // Store binary as data URL so the viewer modal can render PDFs/
          // images and the download flow works for .docx without re-upload.
          conteudo = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result ?? ''))
            reader.onerror = () => reject(reader.error ?? new Error('read failed'))
            reader.readAsDataURL(file)
          })
        }
        addAttachment(meeting.id, {
          nome: file.name,
          tipo: file.type || 'application/octet-stream',
          tamanho: file.size,
          conteudo,
          ehTexto,
        })
      }
    } catch (caught) {
      setErrMsg(caught instanceof Error ? caught.message : 'Falha ao ler arquivo.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function savePaste() {
    if (!pasteText.trim()) return
    const nome = pasteName.trim() || `nota-colada-${meeting.anexos.length + 1}.txt`
    const finalName = nome.toLowerCase().endsWith('.txt') ? nome : `${nome}.txt`
    addAttachment(meeting.id, {
      nome: finalName,
      tipo: 'text/plain',
      tamanho: new Blob([pasteText]).size,
      conteudo: pasteText,
      ehTexto: true,
    })
    setPasteName('')
    setPasteText('')
    setPasting(false)
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded border border-bg-4 bg-bg-1/70">
      <div className="border-b border-bg-4 px-4 py-2.5">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-[9.5px] uppercase tracking-widest text-ink-3">
              Contexto
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[13px] font-semibold text-ink-0">
              <Paperclip className="size-3.5 text-accent-orange" />
              Anexos <span className="text-ink-3">({meeting.anexos.length})</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="font-mono flex items-center gap-1.5 rounded border border-bg-4 bg-bg-2 px-2.5 py-1 text-[10px] uppercase tracking-wider text-ink-2 hover:bg-bg-3 disabled:opacity-50"
            >
              {busy ? <LoaderCircle className="size-3 animate-spin" /> : <Paperclip className="size-3" />}
              Upload
            </button>
            <button
              type="button"
              onClick={() => setPasting((v) => !v)}
              className="font-mono flex items-center gap-1.5 rounded border border-bg-4 bg-bg-2 px-2.5 py-1 text-[10px] uppercase tracking-wider text-ink-2 hover:bg-bg-3"
            >
              <FileText className="size-3" />
              Colar texto
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>
        </div>
        {errMsg ? (
          <div className="font-mono mt-2 rounded border border-accent-red/40 bg-accent-red/10 px-2 py-1.5 text-[10.5px] text-accent-red">
            {errMsg}
          </div>
        ) : null}
      </div>

      {pasting ? (
        <div className="space-y-2 border-b border-bg-4 bg-bg-2/40 p-3">
          <input
            value={pasteName}
            onChange={(e) => setPasteName(e.target.value)}
            placeholder="Nome do anexo (ex.: dossie-presidente-vargas)"
            className={INPUT_CLS}
          />
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Cole aqui o texto do relatório, RELINT, ata anterior…"
            rows={6}
            className={cn(INPUT_CLS, 'min-h-28 resize-y')}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setPasting(false)
                setPasteText('')
                setPasteName('')
              }}
              className="font-mono rounded border border-bg-4 bg-bg-1 px-2.5 py-1 text-[10px] uppercase tracking-wider text-ink-2 hover:bg-bg-3"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={savePaste}
              disabled={!pasteText.trim()}
              className="font-mono rounded bg-accent-orange px-2.5 py-1 text-[10px] uppercase tracking-wider text-white hover:bg-accent-orange/85 disabled:opacity-50"
            >
              Salvar trecho
            </button>
          </div>
        </div>
      ) : null}

      <div className="scrollbar min-h-0 flex-1 overflow-y-auto p-3">
        {meeting.anexos.length === 0 ? (
          <div className="rounded border border-dashed border-bg-4 bg-bg-2/40 px-3 py-6 text-center text-[11.5px] text-ink-3">
            Nenhum anexo ainda. Upload de .txt/.md/.csv/.json é lido e vira contexto;
            outros formatos ficam como referência (apenas nome e tipo).
          </div>
        ) : (
          <ul className="space-y-1.5">
            {meeting.anexos.map((a) => (
              <AttachmentRow
                key={a.id}
                attachment={a}
                onOpen={() => onOpen(a)}
                onRemove={() => removeAttachment(meeting.id, a.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function AttachmentRow({
  attachment,
  onOpen,
  onRemove,
}: {
  attachment: MeetingAttachment
  onOpen: () => void
  onRemove: () => void
}) {
  const sizeLabel = formatBytes(attachment.tamanho)
  const kind = attachmentKind(attachment)
  const kindLabel: Record<AttachmentKind, string> = {
    text: 'txt',
    pdf: 'pdf',
    image: 'img',
    docx: 'docx',
    other: 'ref',
  }

  return (
    <li className="rounded border border-bg-4 bg-bg-2">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <FileText
          className={cn(
            'size-3.5 shrink-0',
            attachment.ehTexto ? 'text-accent-orange' : 'text-ink-3',
          )}
        />
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 truncate cursor-pointer text-left text-[11.5px] text-ink-1 hover:text-ink-0"
          title={attachment.nome}
        >
          {attachment.nome}
        </button>
        <span className="font-mono shrink-0 text-[10px] text-ink-3">
          {sizeLabel}
        </span>
        <span className="font-mono shrink-0 rounded bg-bg-3 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-ink-3">
          {kindLabel[kind]}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded p-1 text-ink-3 hover:bg-bg-4 hover:text-accent-red"
          aria-label="Remover anexo"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </li>
  )
}

const INPUT_CLS =
  'w-full rounded border border-bg-4 bg-bg-2 px-3 py-2 text-[12px] text-ink-1 outline-none placeholder:text-ink-3 focus:border-accent-orange/60 focus:ring-1 focus:ring-accent-orange/40'

function Field({
  label,
  icon,
  full,
  children,
}: {
  label: string
  icon?: React.ReactNode
  full?: boolean
  children: React.ReactNode
}) {
  return (
    <label className={cn('grid gap-1.5', full ? 'sm:col-span-2' : undefined)}>
      <span className="font-mono flex items-center gap-1 text-[9.5px] uppercase tracking-widest text-ink-3">
        {icon ? <span className="text-ink-3">{icon}</span> : null}
        {label}
      </span>
      {children}
    </label>
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

type ReportStage = 'select' | 'generating' | 'done' | 'error'

function ReportGenerationModal({
  meetingId,
  onClose,
}: {
  meetingId: string
  onClose: () => void
}) {
  const [areas, setAreas] = useState<AreaFM[] | null>(null)
  const [loadingAreas, setLoadingAreas] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [stage, setStage] = useState<ReportStage>('select')
  const [progress, setProgress] = useState('')
  const [errMsg, setErrMsg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingAreas(true)
    setErrMsg(null)
    api
      .areasFm()
      .then((res) => {
        if (cancelled) return
        const sorted = [...(res.items ?? [])].sort(
          (a, b) => (b.score ?? 0) - (a.score ?? 0),
        )
        setAreas(sorted)
        if (sorted.length > 0) setSelectedId(sorted[0].id)
      })
      .catch((caught) => {
        if (cancelled) return
        setErrMsg(caught instanceof Error ? caught.message : 'Falha ao buscar áreas FM.')
      })
      .finally(() => {
        if (!cancelled) setLoadingAreas(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function generate() {
    if (!selectedId) return
    setStage('generating')
    setErrMsg(null)
    try {
      setProgress('Buscando dados da área…')
      const report = await api.areaReport(selectedId)
      setProgress('Compondo documento DOCX…')
      const blob = await buildAreaReportDocxBlob(report)
      setProgress('Anexando à reunião…')
      const dataUrl = await blobToDataUrl(blob)
      const baseName = reportFileName(report, 'docx')
      addAttachment(meetingId, {
        nome: baseName,
        tipo: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        tamanho: blob.size,
        conteudo: dataUrl,
        ehTexto: false,
      })
      setStage('done')
      setProgress('Relatório DOCX anexado à reunião.')
    } catch (caught) {
      setErrMsg(caught instanceof Error ? caught.message : 'Falha ao gerar relatório.')
      setStage('error')
    }
  }

  return (
    <ModalShell onClose={onClose} title="Gerar relatório de área" eyebrow="Gerador">
      <div className="space-y-3 p-4">
        {stage === 'select' || stage === 'error' ? (
          <>
            {errMsg ? (
              <div className="font-mono rounded border border-accent-red/40 bg-accent-red/10 px-2 py-1.5 text-[10.5px] text-accent-red">
                {errMsg}
              </div>
            ) : null}
            {loadingAreas ? (
              <div className="flex items-center gap-2 px-1 py-3 text-[11.5px] text-ink-3">
                <LoaderCircle className="size-3.5 animate-spin text-accent-orange" />
                Buscando áreas FM…
              </div>
            ) : null}
            {areas && areas.length > 0 ? (
              <ul className="scrollbar max-h-72 space-y-1 overflow-y-auto rounded border border-bg-4 bg-bg-1 p-1.5">
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
            ) : null}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="font-mono rounded border border-bg-4 bg-bg-1 px-2.5 py-1 text-[10px] uppercase tracking-wider text-ink-2 hover:bg-bg-3"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!selectedId}
                onClick={generate}
                className="font-mono flex items-center gap-1.5 rounded bg-accent-orange px-2.5 py-1 text-[10px] uppercase tracking-wider text-white hover:bg-accent-orange/85 disabled:opacity-50"
              >
                <Sparkles className="size-3" />
                Gerar e anexar
              </button>
            </div>
          </>
        ) : null}

        {stage === 'generating' ? (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <LoaderCircle className="size-7 animate-spin text-accent-orange" />
            <div className="font-mono text-[10.5px] uppercase tracking-wider text-ink-2">
              {progress || 'Gerando…'}
            </div>
            <div className="text-[11.5px] text-ink-3">Não feche esta janela.</div>
          </div>
        ) : null}

        {stage === 'done' ? (
          <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-accent-orange/15 text-accent-orange">
              <FileText className="size-5" />
            </div>
            <div className="text-[12.5px] font-semibold text-ink-0">
              Relatório anexado à reunião
            </div>
            <div className="text-[11.5px] text-ink-3">{progress}</div>
            <button
              type="button"
              onClick={onClose}
              className="font-mono mt-2 rounded bg-accent-orange px-3 py-1 text-[10.5px] uppercase tracking-wider text-white hover:bg-accent-orange/85"
            >
              Fechar
            </button>
          </div>
        ) : null}
      </div>
    </ModalShell>
  )
}

function AttachmentViewerModal({
  attachment,
  onClose,
  onDownload,
}: {
  attachment: MeetingAttachment
  onClose: () => void
  onDownload: () => void
}) {
  const kind = attachmentKind(attachment)
  const canDownload = Boolean(attachment.conteudo) && !attachment.ehTexto

  const body = useMemo(() => {
    if (kind === 'text') {
      const md = attachment.conteudo || ''
      return (
        <div className="chat-markdown scrollbar h-[70vh] overflow-y-auto px-5 py-4 text-[12.5px] leading-relaxed text-ink-1">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
        </div>
      )
    }
    if (kind === 'pdf') {
      if (!attachment.conteudo) {
        return <EmptyAttachmentBody />
      }
      return (
        <iframe
          title={attachment.nome}
          src={attachment.conteudo}
          className="h-[78vh] w-full bg-white"
        />
      )
    }
    if (kind === 'image') {
      if (!attachment.conteudo) {
        return <EmptyAttachmentBody />
      }
      return (
        <div className="flex max-h-[78vh] items-center justify-center bg-bg-0 p-4">
          <img
            src={attachment.conteudo}
            alt={attachment.nome}
            className="max-h-[70vh] max-w-full object-contain"
          />
        </div>
      )
    }
    return <EmptyAttachmentBody />
  }, [attachment, kind])

  return (
    <ModalShell
      onClose={onClose}
      title={attachment.nome}
      eyebrow={kind.toUpperCase()}
      wide
      footer={
        canDownload ? (
          <button
            type="button"
            onClick={onDownload}
            className="font-mono flex items-center gap-1.5 rounded border border-bg-4 bg-bg-2 px-2.5 py-1 text-[10px] uppercase tracking-wider text-ink-1 hover:bg-bg-3"
          >
            <Download className="size-3" />
            Baixar
          </button>
        ) : null
      }
    >
      {body}
    </ModalShell>
  )
}

function EmptyAttachmentBody() {
  return (
    <div className="px-5 py-10 text-center text-[12px] text-ink-3">
      Conteúdo do arquivo indisponível para preview. Re-anexe o arquivo para
      visualizar ou baixar.
    </div>
  )
}

function ModalShell({
  onClose,
  title,
  eyebrow,
  children,
  footer,
  wide,
}: {
  onClose: () => void
  title: string
  eyebrow?: string
  children: React.ReactNode
  footer?: React.ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'flex max-h-[92vh] min-h-0 w-full flex-col overflow-hidden rounded-lg border border-bg-4 bg-bg-1 shadow-[0_30px_80px_rgba(0,0,0,0.6)]',
          wide ? 'max-w-5xl' : 'max-w-xl',
        )}
      >
        <div className="flex items-start justify-between border-b border-bg-4 px-4 py-2.5">
          <div className="min-w-0 pr-4">
            {eyebrow ? (
              <div className="font-mono text-[9.5px] uppercase tracking-widest text-ink-3">
                {eyebrow}
              </div>
            ) : null}
            <div className="mt-0.5 truncate text-[13px] font-semibold text-ink-0" title={title}>
              {title}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {footer}
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-ink-3 hover:bg-bg-2 hover:text-ink-1"
              aria-label="Fechar"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  )
}

export default MeetingDetail
