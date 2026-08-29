import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api, ApiError, streamChat, type ChatHistoryMessage, type ChatThread, type ChatThreadSummary } from '../lib/api'
import { toast } from '../lib/toast'
import './ChatbotWidget.css'

type Attachment = { name: string; type: string; previewUrl?: string }

type Message = {
  id: number
  sender: 'bot' | 'user'
  text: string
  /** What the user attached to this turn. Live sends carry a `previewUrl`; messages loaded
   * from history only have the name/type (the bytes aren't stored), so they render as a chip. */
  attachment?: Attachment
  /** True from the moment a bot message is created until its stream's `done`/`error`
   * event — drives the loading spinner (empty text) vs. growing markdown (has text). */
  isStreaming?: boolean
}

// A chat attachment is capped at 20 MB — matches ai-service's MAX_CHAT_MEDIA_BYTES.
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024

// The chat panel is user-resizable from its top-left corner; the chosen size is remembered.
const PANEL_SIZE_KEY = 'recyclehub.chatbot.size'
const PANEL_MIN_W = 300
const PANEL_MIN_H = 360
const PANEL_DEFAULT_SIZE = { w: 340, h: 440 }

// The conversation currently open in the widget — restored on reload so the chat picks up
// where it left off, like the Messages page does.
const THREAD_KEY = 'recyclehub.chatbot.thread'

const GREETING: Message = {
  id: 0,
  sender: 'bot',
  text: 'Hi! I’m your RecycleHub assistant. Ask me anything about your waste, earnings, or vendors.',
}

type PanelSize = { w: number; h: number }

function clampPanelSize({ w, h }: PanelSize): PanelSize {
  const maxW = Math.max(PANEL_MIN_W, window.innerWidth - 32)
  const maxH = Math.max(PANEL_MIN_H, window.innerHeight - 120)
  return {
    w: Math.round(Math.min(Math.max(w, PANEL_MIN_W), maxW)),
    h: Math.round(Math.min(Math.max(h, PANEL_MIN_H), maxH)),
  }
}

function loadPanelSize(): PanelSize {
  try {
    const raw = localStorage.getItem(PANEL_SIZE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PanelSize>
      if (typeof parsed.w === 'number' && typeof parsed.h === 'number') {
        return clampPanelSize({ w: parsed.w, h: parsed.h })
      }
    }
  } catch {
    // no stored size / unreadable storage — fall through to the default
  }
  return PANEL_DEFAULT_SIZE
}

function loadStoredThreadId(): string | undefined {
  try {
    return localStorage.getItem(THREAD_KEY) || undefined
  } catch {
    return undefined
  }
}

function persistThreadId(id: string | undefined) {
  try {
    if (id) localStorage.setItem(THREAD_KEY, id)
    else localStorage.removeItem(THREAD_KEY)
  } catch {
    // storage unavailable — the conversation just won't resume after a reload
  }
}

const MEDIA_PLACEHOLDER_RE = /^\[(?:image|media|file): .+\]$/

/** Turns a stored history thread back into the widget's message list. */
function historyToMessages(history: ChatHistoryMessage[]): Message[] {
  return history.map((m, index) => {
    const hasMedia = Boolean(m.mediaName)
    const isPlaceholder = hasMedia && MEDIA_PLACEHOLDER_RE.test(m.content)
    return {
      id: index + 1,
      sender: m.role === 'human' ? 'user' : 'bot',
      text: isPlaceholder ? '' : m.content,
      attachment: hasMedia ? { name: m.mediaName, type: m.mediaType } : undefined,
    }
  })
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const mins = Math.floor((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function AttachmentView({ attachment }: { attachment: Attachment }) {
  if (attachment.previewUrl && attachment.type.startsWith('image/')) {
    return <img className="chatbot-attachment" src={attachment.previewUrl} alt={attachment.name} />
  }
  if (attachment.previewUrl && attachment.type.startsWith('video/')) {
    return <video className="chatbot-attachment" src={attachment.previewUrl} controls />
  }
  return (
    <span className="chatbot-file-chip">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <path d="M7 3h7l5 5v13H7z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
      {attachment.name}
    </span>
  )
}

function ChatbotWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [view, setView] = useState<'chat' | 'history'>('chat')
  const [messages, setMessages] = useState<Message[]>([GREETING])
  const [draft, setDraft] = useState('')
  const [threadId, setThreadId] = useState<string | undefined>(loadStoredThreadId)
  const [isSending, setIsSending] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messageListRef = useRef<HTMLDivElement>(null)

  const [threads, setThreads] = useState<ChatThreadSummary[]>([])
  const [threadsLoading, setThreadsLoading] = useState(false)
  const [threadsError, setThreadsError] = useState<string | null>(null)

  const [panelSize, setPanelSize] = useState<PanelSize>(loadPanelSize)
  const resizeStart = useRef<{ x: number; y: number; w: number; h: number } | null>(null)

  // --- history / threads ---

  const refreshThreads = useCallback(async () => {
    setThreadsLoading(true)
    try {
      setThreads(await api.get<ChatThreadSummary[]>('/api/ai/chat/threads'))
      setThreadsError(null)
    } catch (err) {
      setThreadsError(err instanceof ApiError ? err.message : 'Could not load your chat history.')
    } finally {
      setThreadsLoading(false)
    }
  }, [])

  const startNewChat = useCallback(() => {
    setMessages([GREETING])
    setThreadId(undefined)
    persistThreadId(undefined)
    setDraft('')
    setPendingFile(null)
    setView('chat')
  }, [])

  const openThread = useCallback(
    async (id: string) => {
      setView('chat')
      try {
        const thread = await api.get<ChatThread>(`/api/ai/chat/threads/${id}`)
        setMessages(thread.messages.length ? historyToMessages(thread.messages) : [GREETING])
        setThreadId(id)
        persistThreadId(id)
      } catch {
        // thread was deleted, or isn't ours — drop the stale pointer and start fresh
        persistThreadId(undefined)
        startNewChat()
      }
    },
    [startNewChat],
  )

  const deleteThread = useCallback(
    async (id: string) => {
      try {
        await api.delete(`/api/ai/chat/threads/${id}`)
      } catch {
        toast.error('Could not delete that conversation.')
        return
      }
      setThreads((prev) => prev.filter((t) => t.threadId !== id))
      setThreadId((current) => {
        if (current === id) {
          setMessages([GREETING])
          persistThreadId(undefined)
          return undefined
        }
        return current
      })
    },
    [],
  )

  // Restore the last conversation on mount.
  useEffect(() => {
    const stored = loadStoredThreadId()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch, not derived state
    if (stored) openThread(stored)
  }, [openThread])

  // Refresh the history list whenever the panel is opened.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch, not derived state
    if (isOpen) refreshThreads()
  }, [isOpen, refreshThreads])

  // Keep the newest message in view.
  useEffect(() => {
    const el = messageListRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, view])

  // --- resize ---

  useEffect(() => {
    try {
      localStorage.setItem(PANEL_SIZE_KEY, JSON.stringify(panelSize))
    } catch {
      // storage unavailable (private window, blocked) — size just won't persist
    }
  }, [panelSize])

  useEffect(() => {
    const onResize = () => setPanelSize((cur) => clampPanelSize(cur))
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      // In case a drag was interrupted by unmount / the panel closing.
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [])

  const onResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeStart.current = { x: event.clientX, y: event.clientY, w: panelSize.w, h: panelSize.h }
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'nwse-resize'
  }

  const onResizePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = resizeStart.current
    if (!start) return
    setPanelSize(
      clampPanelSize({
        w: start.w + (start.x - event.clientX),
        h: start.h + (start.y - event.clientY),
      }),
    )
  }

  const onResizePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!resizeStart.current) return
    resizeStart.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
  }

  const onResizeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = 24
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    }
    const delta = deltas[event.key]
    if (!delta) return
    event.preventDefault()
    setPanelSize((cur) => clampPanelSize({ w: cur.w + delta[0], h: cur.h + delta[1] }))
  }

  // --- sending ---

  const pickFile = (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error('That file is over 20 MB — please attach a smaller one.')
      return
    }
    setPendingFile(file)
  }

  const handleSend = async (event: FormEvent) => {
    event.preventDefault()
    const text = draft.trim()
    const file = pendingFile
    if ((!text && !file) || isSending) return

    const userMessage: Message = {
      id: Date.now(),
      sender: 'user',
      text,
      attachment: file
        ? { previewUrl: URL.createObjectURL(file), name: file.name, type: file.type }
        : undefined,
    }
    const botMessageId = Date.now() + 1
    setMessages((prev) => [...prev, userMessage, { id: botMessageId, sender: 'bot', text: '', isStreaming: true }])
    setDraft('')
    setPendingFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setIsSending(true)

    const setBotText = (updater: (prevText: string) => string) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === botMessageId ? { ...m, text: updater(m.text) } : m)),
      )
    }
    const stopStreaming = () => {
      setMessages((prev) => prev.map((m) => (m.id === botMessageId ? { ...m, isStreaming: false } : m)))
    }

    try {
      for await (const streamEvent of streamChat(text, threadId, undefined, file ?? undefined)) {
        switch (streamEvent.type) {
          case 'delta':
            setBotText((prevText) => prevText + streamEvent.text)
            break
          case 'reset':
            setBotText(() => '')
            break
          case 'done':
            setThreadId(streamEvent.threadId)
            persistThreadId(streamEvent.threadId)
            stopStreaming()
            refreshThreads()
            break
          case 'error':
            setBotText(() => streamEvent.message)
            stopStreaming()
            break
        }
      }
    } catch {
      setBotText(() => 'Something went wrong reaching the assistant. Please try again.')
    } finally {
      stopStreaming()
      setIsSending(false)
    }
  }

  const iconClose = (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )

  return (
    <div className="chatbot-widget">
      {isOpen && (
        <div
          className="chatbot-panel"
          role="dialog"
          aria-label="RecycleHub Assistant"
          style={{ width: panelSize.w, height: panelSize.h }}
        >
          <div
            className="chatbot-resize-handle"
            role="button"
            tabIndex={0}
            aria-label="Resize chat window (use arrow keys)"
            title="Drag to resize"
            onPointerDown={onResizePointerDown}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
            onKeyDown={onResizeKeyDown}
          >
            <svg viewBox="0 0 10 10" aria-hidden="true">
              <path d="M9 1 1 9M9 5 5 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </div>

          <div className="chatbot-header">
            {view === 'history' ? (
              <div className="chatbot-header-info">
                <button
                  type="button"
                  className="chatbot-icon-btn"
                  aria-label="Back to chat"
                  onClick={() => setView('chat')}
                >
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <p className="chatbot-title">Chat history</p>
              </div>
            ) : (
              <div className="chatbot-header-info">
                <span className="chatbot-avatar" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="4" y="6" width="16" height="12" rx="3" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M9 21l3-3 3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="9" cy="12" r="1.2" fill="currentColor" />
                    <circle cx="15" cy="12" r="1.2" fill="currentColor" />
                  </svg>
                </span>
                <div>
                  <p className="chatbot-title">RecycleHub Assistant</p>
                  <p className="chatbot-status">Online</p>
                </div>
              </div>
            )}

            <div className="chatbot-header-actions">
              {view === 'chat' && (
                <>
                  <button
                    type="button"
                    className="chatbot-icon-btn"
                    aria-label="New chat"
                    title="New chat"
                    onClick={startNewChat}
                  >
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="chatbot-icon-btn"
                    aria-label="Chat history"
                    title="Chat history"
                    onClick={() => {
                      setView('history')
                      refreshThreads()
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M4 7h16M4 12h16M4 17h10" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                    </svg>
                  </button>
                </>
              )}
              <button type="button" className="chatbot-icon-btn" aria-label="Close chat" onClick={() => setIsOpen(false)}>
                {iconClose}
              </button>
            </div>
          </div>

          {view === 'history' ? (
            <div className="chatbot-history">
              {threadsLoading ? (
                <p className="chatbot-history-state">Loading…</p>
              ) : threadsError ? (
                <p className="chatbot-history-state">{threadsError}</p>
              ) : threads.length === 0 ? (
                <p className="chatbot-history-state">No past conversations yet.</p>
              ) : (
                <ul>
                  {threads.map((thread) => (
                    <li
                      key={thread.threadId}
                      className={thread.threadId === threadId ? 'is-active' : undefined}
                    >
                      <button
                        type="button"
                        className="chatbot-history-item"
                        onClick={() => openThread(thread.threadId)}
                      >
                        <span className="chatbot-history-title">
                          {thread.title || 'New conversation'}
                        </span>
                        <span className="chatbot-history-time">{timeAgo(thread.updatedAt)}</span>
                      </button>
                      <button
                        type="button"
                        className="chatbot-history-delete"
                        aria-label="Delete conversation"
                        onClick={() => deleteThread(thread.threadId)}
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
                          <path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <>
              <div className="chatbot-messages" ref={messageListRef}>
                {messages.map((message) =>
                  message.sender === 'bot' && message.isStreaming && !message.text ? (
                    <div className="chatbot-message bot loading" key={message.id} aria-live="polite" aria-label="Assistant is thinking">
                      <span className="chatbot-spinner" />
                    </div>
                  ) : (
                    <div className={`chatbot-message ${message.sender}`} key={message.id}>
                      {message.sender === 'bot' ? (
                        <div className="chatbot-markdown">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
                        </div>
                      ) : (
                        <>
                          {message.attachment && <AttachmentView attachment={message.attachment} />}
                          {message.text && <span>{message.text}</span>}
                        </>
                      )}
                    </div>
                  ),
                )}
              </div>

              {pendingFile && (
                <div className="chatbot-pending" role="status">
                  <span className="chatbot-pending-name">📎 {pendingFile.name}</span>
                  <button
                    type="button"
                    aria-label="Remove attachment"
                    onClick={() => {
                      setPendingFile(null)
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                  >
                    ×
                  </button>
                </div>
              )}

              <form className="chatbot-input-row" onSubmit={handleSend}>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="chatbot-file-input"
                  onChange={(event) => pickFile(event.target.files?.[0])}
                  aria-hidden="true"
                  tabIndex={-1}
                />
                <button
                  type="button"
                  className="chatbot-attach-btn"
                  aria-label="Attach a file"
                  disabled={isSending}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M21 11.5l-8.5 8.5a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <input
                  type="text"
                  placeholder="Type a message…"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  aria-label="Message"
                  disabled={isSending}
                />
                <button
                  type="submit"
                  aria-label="Send message"
                  disabled={isSending || (!draft.trim() && !pendingFile)}
                >
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 20l16-8L4 4v6l10 2-10 2v6Z" fill="currentColor" />
                  </svg>
                </button>
              </form>
            </>
          )}
        </div>
      )}

      <button
        type="button"
        className="chatbot-fab"
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
        onClick={() => setIsOpen((open) => !open)}
      >
        {isOpen ? (
          iconClose
        ) : (
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 5h16v11H9l-4 4V5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    </div>
  )
}

export default ChatbotWidget
