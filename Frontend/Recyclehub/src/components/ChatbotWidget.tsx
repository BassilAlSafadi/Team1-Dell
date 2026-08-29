import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { streamChat } from '../lib/api'
import { toast } from '../lib/toast'
import './ChatbotWidget.css'

type Attachment = { previewUrl: string; name: string; type: string }

type Message = {
  id: number
  sender: 'bot' | 'user'
  text: string
  /** What the user attached to this turn, shown inline (chat replies don't echo it back). */
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

function AttachmentView({ attachment }: { attachment: Attachment }) {
  if (attachment.type.startsWith('image/')) {
    return <img className="chatbot-attachment" src={attachment.previewUrl} alt={attachment.name} />
  }
  if (attachment.type.startsWith('video/')) {
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

const initialMessages: Message[] = [
  {
    id: 0,
    sender: 'bot',
    text: 'Hi! I’m your RecycleHub assistant. Ask me anything about your waste, earnings, or vendors.',
  },
]

function ChatbotWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [draft, setDraft] = useState('')
  const [threadId, setThreadId] = useState<string | undefined>(undefined)
  const [isSending, setIsSending] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [panelSize, setPanelSize] = useState<PanelSize>(loadPanelSize)
  const resizeStart = useRef<{ x: number; y: number; w: number; h: number } | null>(null)

  // Remember the chosen size. Writing on every drag frame is cheap and avoids the stale
  // closure a persist-on-pointerup would capture.
  useEffect(() => {
    try {
      localStorage.setItem(PANEL_SIZE_KEY, JSON.stringify(panelSize))
    } catch {
      // storage unavailable (private window, blocked) — size just won't persist
    }
  }, [panelSize])

  // Keep the panel on-screen if the viewport shrinks below the last chosen size.
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
    // Stop the drag from selecting page text / flickering the cursor.
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'nwse-resize'
  }

  const onResizePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = resizeStart.current
    if (!start) return
    // The panel is pinned to the bottom-right, so dragging the top-left handle left/up
    // grows it: add the distance the pointer has travelled back toward the origin.
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
      for await (const event of streamChat(text, threadId, undefined, file ?? undefined)) {
        switch (event.type) {
          case 'delta':
            setBotText((prevText) => prevText + event.text)
            break
          case 'reset':
            setBotText(() => '')
            break
          case 'done':
            setThreadId(event.threadId)
            stopStreaming()
            break
          case 'error':
            setBotText(() => event.message)
            stopStreaming()
            break
        }
      }
    } catch {
      // A dropped connection mid-stream throws out of the generator instead of yielding a
      // clean 'error' event — same fallback message as the non-streaming request path used.
      setBotText(() => 'Something went wrong reaching the assistant. Please try again.')
    } finally {
      stopStreaming()
      setIsSending(false)
    }
  }

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
            <div className="chatbot-header-info">
              <span className="chatbot-avatar" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect
                    x="4"
                    y="6"
                    width="16"
                    height="12"
                    rx="3"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M9 21l3-3 3 3"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx="9" cy="12" r="1.2" fill="currentColor" />
                  <circle cx="15" cy="12" r="1.2" fill="currentColor" />
                </svg>
              </span>
              <div>
                <p className="chatbot-title">RecycleHub Assistant</p>
                <p className="chatbot-status">Online</p>
              </div>
            </div>

            <button
              type="button"
              className="chatbot-close"
              aria-label="Close chat"
              onClick={() => setIsOpen(false)}
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          <div className="chatbot-messages">
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
                <path
                  d="M4 20l16-8L4 4v6l10 2-10 2v6Z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        className="chatbot-fab"
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
        onClick={() => setIsOpen((open) => !open)}
      >
        {isOpen ? (
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M4 5h16v11H9l-4 4V5Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
    </div>
  )
}

export default ChatbotWidget
