import { useState, type FormEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { streamChat } from '../lib/api'
import './ChatbotWidget.css'

type Message = {
  id: number
  sender: 'bot' | 'user'
  text: string
  /** True from the moment a bot message is created until its stream's `done`/`error`
   * event — drives the loading spinner (empty text) vs. growing markdown (has text). */
  isStreaming?: boolean
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

  const handleSend = async (event: FormEvent) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text || isSending) return

    const userMessage: Message = { id: Date.now(), sender: 'user', text }
    const botMessageId = Date.now() + 1
    setMessages((prev) => [...prev, userMessage, { id: botMessageId, sender: 'bot', text: '', isStreaming: true }])
    setDraft('')
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
      for await (const event of streamChat(text, threadId)) {
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
        <div className="chatbot-panel" role="dialog" aria-label="RecycleHub Assistant">
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
                    message.text
                  )}
                </div>
              ),
            )}
          </div>

          <form className="chatbot-input-row" onSubmit={handleSend}>
            <input
              type="text"
              placeholder="Type a message…"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              aria-label="Message"
              disabled={isSending}
            />
            <button type="submit" aria-label="Send message" disabled={isSending}>
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
