import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Eraser,
  LoaderCircle,
  MessageCircle,
  Send,
  X,
} from 'lucide-react'

import {
  clearMessages,
  sendMeetingMessage,
  useMeetings,
  type Meeting,
} from '../lib/meetingsStore'
import { cn } from './../lib/utils'

export function FloatingMeetingChat({ meeting }: { meeting: Meeting }) {
  const { isSending, error } = useMeetings()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [lastReadCount, setLastReadCount] = useState(meeting.mensagens.length)
  const scrollerRef = useRef<HTMLDivElement | null>(null)

  // Reset unread tracking when switching meeting.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLastReadCount(meeting.mensagens.length)
    setOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting.id])

  // Mark read when chat is open or new message arrives while open.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setLastReadCount(meeting.mensagens.length)
  }, [open, meeting.mensagens.length])

  // Auto-scroll to bottom on new message.
  useEffect(() => {
    const el = scrollerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [meeting.mensagens.length, isSending, open])

  // Esc closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const unread = !open && meeting.mensagens.length > lastReadCount

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const content = input.trim()
    if (!content || isSending) return
    setInput('')
    await sendMeetingMessage(meeting.id, content)
  }

  const contextLabel = `${meeting.anexos.length} anexo${
    meeting.anexos.length === 1 ? '' : 's'
  }${meeting.notas.trim() ? ' + notas' : ''}`

  return (
    <div className="pointer-events-none fixed inset-0 z-[1000]">
      <div
        className={cn(
          'pointer-events-auto absolute bottom-20 right-5 flex h-[min(72vh,600px)] w-[min(420px,92vw)] flex-col overflow-hidden rounded-lg border border-bg-4 bg-bg-1 shadow-[0_20px_60px_rgba(0,0,0,0.6)] transition-opacity',
          open ? 'opacity-100' : 'pointer-events-none invisible opacity-0',
        )}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-bg-4 bg-bg-2 px-3 py-2">
          <div>
            <div className="flex items-center gap-2 text-[12px] font-semibold text-ink-0">
              <MessageCircle className="size-3.5 text-accent-orange" />
              Chat
            </div>
            <div className="font-mono mt-0.5 text-[9px] uppercase tracking-wider text-ink-3">
              Contexto: {contextLabel}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                if (meeting.mensagens.length === 0) return
                if (window.confirm('Limpar histórico do chat desta reunião?')) {
                  clearMessages(meeting.id)
                  setLastReadCount(0)
                }
              }}
              disabled={meeting.mensagens.length === 0}
              className="font-mono flex items-center gap-1 rounded border border-bg-4 bg-bg-1 px-2 py-1 text-[9.5px] uppercase tracking-wider text-ink-2 hover:bg-bg-3 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Eraser className="size-3" />
              Limpar
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-1 text-ink-2 hover:bg-bg-3 hover:text-ink-0"
              aria-label="Fechar"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>

        <div
          ref={scrollerRef}
          className="scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto p-3"
        >
          {meeting.mensagens.length === 0 ? (
            <div className="rounded border border-dashed border-bg-4 bg-bg-2/40 px-3 py-6 text-center text-[11.5px] text-ink-3">
              Faça a primeira pergunta. O assistente verá título, data,
              participantes, notas e o conteúdo dos anexos como contexto.
            </div>
          ) : (
            meeting.mensagens.map((m, i) => (
              <div
                key={i}
                className={cn(
                  'max-w-[88%] rounded px-3 py-2 text-[12px] leading-5',
                  m.role === 'user'
                    ? 'ml-auto bg-accent-orange/15 text-ink-0 ring-1 ring-accent-orange/30'
                    : 'mr-auto border-l-2 border-accent-orange bg-bg-3/60 text-ink-1',
                )}
              >
                {m.role === 'user' ? (
                  <div className="whitespace-pre-wrap">{m.content}</div>
                ) : (
                  <div className="chat-markdown">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        a: ({ children, href }) => (
                          <a
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            className="text-accent-orange underline underline-offset-2 hover:text-accent-orange/85"
                          >
                            {children}
                          </a>
                        ),
                        code: ({ children, className: cls }) => {
                          const isBlock = (cls ?? '').includes('language-')
                          if (isBlock) {
                            return (
                              <pre className="scrollbar overflow-x-auto rounded border border-bg-4 bg-bg-2 px-3 py-2 text-[11px] leading-5 text-ink-1">
                                <code>{children}</code>
                              </pre>
                            )
                          }
                          return (
                            <code className="rounded bg-bg-2 px-1 py-0.5 text-[11px] text-accent-orange">
                              {children}
                            </code>
                          )
                        },
                      }}
                    >
                      {m.content}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            ))
          )}
          {isSending ? (
            <div className="mr-auto flex items-center gap-2 rounded border border-bg-4 bg-bg-3/60 px-3 py-2 text-[11.5px] text-ink-2">
              <LoaderCircle className="size-3.5 animate-spin text-accent-orange" />
              Gerando resposta…
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="font-mono mx-3 mb-2 rounded border border-accent-red/40 bg-accent-red/10 px-3 py-2 text-[11px] text-accent-red">
            {error}
          </div>
        ) : null}

        <form className="flex gap-2 border-t border-bg-4 p-3" onSubmit={handleSubmit}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                e.currentTarget.form?.requestSubmit()
              }
            }}
            placeholder="Pergunte usando o contexto da reunião…"
            className="min-h-11 flex-1 resize-none rounded border border-bg-4 bg-bg-2 px-3 py-2 text-[12px] leading-5 text-ink-1 outline-none placeholder:text-ink-3 focus:border-accent-orange/60 focus:ring-1 focus:ring-accent-orange/40"
          />
          <button
            type="submit"
            disabled={isSending || !input.trim()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-accent-orange text-white transition hover:bg-accent-orange/85 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Enviar"
          >
            <Send className="size-4" />
          </button>
        </form>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto absolute bottom-5 right-5 flex size-12 items-center justify-center rounded-full bg-accent-orange text-white shadow-[0_10px_28px_rgba(255,107,53,0.45)] transition hover:bg-accent-orange/85"
        aria-label={open ? 'Fechar chat da reunião' : 'Abrir chat da reunião'}
      >
        {open ? (
          <X className="size-5" />
        ) : (
          <>
            <MessageCircle className="size-5" />
            {isSending ? (
              <span className="absolute -top-1 -right-1 size-2.5 animate-pulse rounded-full bg-white" />
            ) : unread ? (
              <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-accent-cyan" />
            ) : null}
          </>
        )}
      </button>
    </div>
  )
}

export default FloatingMeetingChat
