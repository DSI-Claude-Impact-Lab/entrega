import { useState } from 'react'
import type { FormEvent } from 'react'
import { LoaderCircle, MessageCircle, Send, Sparkles } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { sendMessage, setSystemPrompt, useChat } from '../lib/chatStore'
import { cn } from '../lib/utils'

type Density = 'comfortable' | 'compact'

const EXAMPLE_QUESTIONS: string[] = [
  'Qual área da Força Municipal está com pior tendência neste mês?',
  'Quais os 3 logradouros prioritários para patrulhamento noturno?',
  'Que fatores urbanos da Av. Brasil deveriam ser tratados primeiro?',
  'Compare o roubo a transeunte entre Centro e Copacabana.',
  'Onde há bingos (crime + fator urbano) no Méier?',
]

export function ChatPanel({
  density = 'comfortable',
  showSystemPrompt = true,
  showExamples = true,
  className,
}: {
  density?: Density
  showSystemPrompt?: boolean
  showExamples?: boolean
  className?: string
}) {
  const { messages, systemPrompt, isSending, error } = useChat()
  const [input, setInput] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const content = input.trim()
    if (!content || isSending) return
    setInput('')
    await sendMessage(content)
  }

  const compact = density === 'compact'
  // Only show example chips while the conversation is the initial greeting.
  const onlyGreeting = messages.length <= 1
  const showExampleChips = showExamples && onlyGreeting && !isSending

  return (
    <section
      className={cn(
        'flex h-full flex-col rounded border border-bg-4 bg-bg-1/70',
        className,
      )}
    >
      <div className="border-b border-bg-4 px-4 py-2.5">
        <div className="font-mono text-[9.5px] uppercase tracking-widest text-ink-3">
          Operacional
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[13px] font-semibold text-ink-0">
          <MessageCircle className="size-3.5 text-accent-orange" />
          Assistente CompStat
        </div>
      </div>

      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-3',
          compact ? 'p-3' : 'p-4',
        )}
      >
        {showSystemPrompt ? (
          <label className="grid gap-1.5">
            <span className="font-mono text-[9.5px] uppercase tracking-widest text-ink-3">
              System prompt
            </span>
            <textarea
              className="min-h-14 resize-none rounded border border-bg-4 bg-bg-2 px-3 py-2 text-[11.5px] leading-5 text-ink-1 outline-none focus:border-accent-orange/60 focus:ring-1 focus:ring-accent-orange/40"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
            />
          </label>
        ) : null}

        <div
          className={cn(
            'scrollbar min-h-0 flex-1 overflow-y-auto rounded border border-bg-4 bg-bg-2 p-3',
          )}
        >
          <div className="grid gap-2">
            {messages.map((m, i) => (
              <Bubble key={`${m.role}-${i}`} role={m.role} content={m.content} />
            ))}
            {isSending ? (
              <div className="mr-auto flex items-center gap-2 rounded border border-bg-4 bg-bg-3/60 px-3 py-2 text-[11.5px] text-ink-2">
                <LoaderCircle className="size-3.5 animate-spin text-accent-orange" />
                Gerando resposta…
              </div>
            ) : null}

            {showExampleChips ? (
              <div className="mt-2">
                <div className="font-mono mb-1.5 flex items-center gap-1.5 text-[9.5px] uppercase tracking-widest text-ink-3">
                  <Sparkles className="size-3 text-accent-orange" />
                  Exemplos de perguntas
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {EXAMPLE_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => {
                        if (isSending) return
                        void sendMessage(q)
                      }}
                      className="rounded border border-bg-4 bg-bg-3/60 px-2.5 py-1.5 text-left text-[11px] leading-snug text-ink-1 transition hover:border-accent-orange/40 hover:bg-bg-3 hover:text-ink-0"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="font-mono rounded border border-accent-red/40 bg-accent-red/10 px-3 py-2 text-[11px] text-accent-red">
            {error}
          </div>
        ) : null}

        <form className="flex gap-2" onSubmit={handleSubmit}>
          <textarea
            className="min-h-11 flex-1 resize-none rounded border border-bg-4 bg-bg-2 px-3 py-2 text-[12px] leading-5 text-ink-1 outline-none placeholder:text-ink-3 focus:border-accent-orange/60 focus:ring-1 focus:ring-accent-orange/40"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                e.currentTarget.form?.requestSubmit()
              }
            }}
            placeholder="Pergunte sobre a área, riscos ou próximas ações…"
          />
          <button
            type="submit"
            disabled={isSending || !input.trim()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-accent-orange text-white transition hover:bg-accent-orange/85 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Enviar mensagem"
          >
            <Send className="size-4" />
          </button>
        </form>
      </div>
    </section>
  )
}

function Bubble({
  role,
  content,
}: {
  role: 'user' | 'assistant'
  content: string
}) {
  const isUser = role === 'user'
  return (
    <div
      className={cn(
        'max-w-[88%] rounded px-3 py-2 text-[12px] leading-5',
        isUser
          ? 'ml-auto bg-accent-orange/15 text-ink-0 ring-1 ring-accent-orange/30'
          : 'mr-auto border-l-2 border-accent-orange bg-bg-3/60 text-ink-1',
      )}
    >
      {isUser ? (
        <span className="whitespace-pre-wrap">{content}</span>
      ) : (
        <Markdown content={content} />
      )}
    </div>
  )
}

function Markdown({ content }: { content: string }) {
  return (
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
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default ChatPanel
