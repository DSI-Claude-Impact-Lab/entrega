import { useEffect, useState } from 'react'
import { MessageCircle, X } from 'lucide-react'

import { markChatRead, useChat } from '../lib/chatStore'
import { ChatPanel } from './ChatPanel'

export function FloatingChat() {
  const [open, setOpen] = useState(false)
  const { messages, isSending, lastReadCount } = useChat()
  const unread = !open && messages.length > lastReadCount

  // Mark as read whenever the chat is open or new messages arrive while open.
  useEffect(() => {
    if (open) markChatRead()
  }, [open, messages.length])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="pointer-events-none fixed inset-0 z-[1000]">
      {/* Keep ChatPanel mounted across open/close to preserve scroll +
          textarea state. Visibility toggled via CSS. */}
      <div
        className={`pointer-events-auto absolute bottom-20 right-5 flex h-[min(70vh,560px)] w-[min(380px,90vw)] flex-col overflow-hidden rounded-lg border border-bg-4 bg-bg-1 shadow-[0_20px_60px_rgba(0,0,0,0.6)] transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none invisible opacity-0'
        }`}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-bg-4 bg-bg-2 px-3 py-2">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-ink-0">
            <MessageCircle className="size-3.5 text-accent-orange" />
            Chat
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded p-1 text-ink-2 hover:bg-bg-3 hover:text-ink-0"
            aria-label="Fechar"
          >
            <X className="size-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <ChatPanel density="compact" showSystemPrompt={false} />
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto absolute bottom-5 right-5 flex size-12 items-center justify-center rounded-full bg-accent-orange text-white shadow-[0_10px_28px_rgba(255,107,53,0.45)] transition hover:bg-accent-orange/85"
        aria-label={open ? 'Fechar assistente' : 'Abrir assistente'}
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

export default FloatingChat
