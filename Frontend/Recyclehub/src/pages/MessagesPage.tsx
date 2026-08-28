import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import Navbar from '../components/Navbar'
import ChatbotWidget from '../components/ChatbotWidget'
import RetryState from '../components/RetryState'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import './MessagesPage.css'

// messaging-service is proxied through the gateway as-is (no REST transform layer like the
// .NET services get), so these mirror its Mongoose schemas' snake_case fields verbatim.
type Participant = { user_id: string; role: 'vendor' | 'corporate' }
type LastMessage = {
  message_id: string
  sender_id: string
  content_preview: string
  sent_at: string
} | null
type ConversationDto = {
  _id: string
  participants: Participant[]
  listing_id: string | null
  last_message: LastMessage
  created_at: string
  updated_at: string
}
type MessageDto = {
  _id: string
  conversation_id: string
  sender_id: string
  content: string
  message_type: string
  created_at: string
}

type VendorProfileResponse = { userId: string; vendorName: string }
type CorporateProfileResponse = { userId: string; companyName: string }

const CONVERSATION_POLL_MS = 15000
const MESSAGE_POLL_MS = 5000

function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const diffMs = Date.now() - date.getTime()
  if (diffMs < 60 * 60 * 1000) {
    const minutes = Math.max(0, Math.floor(diffMs / 60000))
    return minutes < 1 ? 'Just now' : `${minutes}m ago`
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
    date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('') || '?'
}

function MessagesPage() {
  const { user } = useAuth()
  const location = useLocation()

  const [conversations, setConversations] = useState<ConversationDto[]>([])
  const [namesByUserId, setNamesByUserId] = useState<Record<string, string>>({})
  const [selectedId, setSelectedId] = useState<string | null>(
    (location.state as { conversationId?: string } | null)?.conversationId ?? null,
  )
  const [messages, setMessages] = useState<MessageDto[]>([])
  const [draft, setDraft] = useState('')

  const [isLoadingList, setIsLoadingList] = useState(true)
  const [isLoadingThread, setIsLoadingThread] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [threadError, setThreadError] = useState<string | null>(null)
  // Bumped by the retry button below to re-run the effect as if it were mounting fresh
  // (isInitial: true), without disturbing the interval/cancellation logic inside it.
  const [listRetryKey, setListRetryKey] = useState(0)

  const bottomRef = useRef<HTMLDivElement>(null)

  // Conversation list — refreshed periodically like Navbar's notification poll, but a
  // background refresh never disturbs the loading/error UI, only the initial fetch does.
  useEffect(() => {
    let cancelled = false

    async function loadConversations(isInitial: boolean) {
      if (isInitial) {
        setIsLoadingList(true)
        setListError(null)
      }
      try {
        const [convos, vendors, corporates] = await Promise.all([
          api.get<ConversationDto[]>('/api/conversations'),
          api.get<VendorProfileResponse[]>('/api/vendor-profiles').catch(() => []),
          api.get<CorporateProfileResponse[]>('/api/corporate-profiles').catch(() => []),
        ])
        if (cancelled) return

        setConversations(convos)
        const names: Record<string, string> = {}
        vendors.forEach((v) => {
          names[v.userId] = v.vendorName
        })
        corporates.forEach((c) => {
          names[c.userId] = c.companyName
        })
        setNamesByUserId(names)
        setSelectedId((current) => current ?? convos[0]?._id ?? null)
      } catch (err) {
        if (!cancelled && isInitial) {
          setListError(err instanceof ApiError ? err.message : 'Failed to load conversations.')
        }
      } finally {
        if (!cancelled && isInitial) setIsLoadingList(false)
      }
    }

    loadConversations(true)
    const interval = setInterval(() => loadConversations(false), CONVERSATION_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [listRetryKey])

  // Selected thread — polled while open so a reply shows up without a manual refresh.
  // No selectedId branch here: the thread panel itself is gated on selectedConversation
  // below, so a stale `messages` value while nothing is selected is never rendered.
  useEffect(() => {
    if (!selectedId) return
    let cancelled = false

    async function loadThread(isInitial: boolean) {
      if (isInitial) {
        setIsLoadingThread(true)
        setThreadError(null)
      }
      try {
        const msgs = await api.get<MessageDto[]>(`/api/conversations/${selectedId}/messages`, { limit: 100 })
        if (cancelled) return
        setMessages([...msgs].reverse())
      } catch (err) {
        if (!cancelled && isInitial) {
          setThreadError(err instanceof ApiError ? err.message : 'Failed to load messages.')
        }
      } finally {
        if (!cancelled && isInitial) setIsLoadingThread(false)
      }
    }

    loadThread(true)
    const interval = setInterval(() => loadThread(false), MESSAGE_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [selectedId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handleSend = async (event: FormEvent) => {
    event.preventDefault()
    const content = draft.trim()
    if (!content || !selectedId || isSending) return

    setIsSending(true)
    setThreadError(null)
    try {
      const message = await api.post<MessageDto>(`/api/conversations/${selectedId}/messages`, { content })
      setMessages((prev) => [...prev, message])
      setDraft('')
    } catch (err) {
      setThreadError(err instanceof ApiError ? err.message : 'Failed to send message.')
    } finally {
      setIsSending(false)
    }
  }

  const otherParticipant = (conversation: ConversationDto) =>
    conversation.participants.find((p) => p.user_id !== user?.userId)

  const displayName = (conversation: ConversationDto): string => {
    const other = otherParticipant(conversation)
    if (!other) return 'Unknown'
    return namesByUserId[other.user_id] ?? (other.role === 'vendor' ? 'Vendor' : 'Business')
  }

  const selectedConversation = conversations.find((c) => c._id === selectedId) ?? null

  return (
    <div className="page">
      <Navbar />

      <main className="app-main">
        <div className="page-header">
          <h1>Messages</h1>
          <p>Talk directly with the vendors and businesses you&rsquo;re working with.</p>
        </div>

        <div className="messages-layout">
          <aside className="conversation-list panel">
            {isLoadingList ? (
              <p className="messages-state">Loading conversations…</p>
            ) : listError ? (
              <RetryState
                message={listError}
                onRetry={() => setListRetryKey((k) => k + 1)}
                centered
              />
            ) : conversations.length === 0 ? (
              <p className="messages-state">
                No conversations yet — reach out from Find Vendors or Find Requests.
              </p>
            ) : (
              <ul className="conversation-items">
                {conversations.map((conversation) => {
                  const name = displayName(conversation)
                  return (
                    <li key={conversation._id}>
                      <button
                        type="button"
                        className={`conversation-item${conversation._id === selectedId ? ' active' : ''}`}
                        onClick={() => setSelectedId(conversation._id)}
                      >
                        <span className="conversation-avatar" aria-hidden="true">
                          {initials(name)}
                        </span>
                        <span className="conversation-info">
                          <span className="conversation-name">{name}</span>
                          <span className="conversation-preview">
                            {conversation.last_message?.content_preview ?? 'No messages yet'}
                          </span>
                        </span>
                        {conversation.last_message && (
                          <span className="conversation-time">
                            {formatTime(conversation.last_message.sent_at)}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </aside>

          <section className="conversation-thread panel">
            {!selectedConversation ? (
              <p className="messages-state">Select a conversation to start messaging.</p>
            ) : (
              <>
                <div className="thread-header">
                  <span className="conversation-avatar" aria-hidden="true">
                    {initials(displayName(selectedConversation))}
                  </span>
                  <h2>{displayName(selectedConversation)}</h2>
                </div>

                <div className="thread-messages">
                  {isLoadingThread ? (
                    <p className="messages-state">Loading messages…</p>
                  ) : threadError ? (
                    <p className="messages-state">{threadError}</p>
                  ) : messages.length === 0 ? (
                    <p className="messages-state">No messages yet — say hello.</p>
                  ) : (
                    messages.map((message) => (
                      <div
                        className={`thread-message ${message.sender_id === user?.userId ? 'mine' : 'theirs'}`}
                        key={message._id}
                      >
                        <p>{message.content}</p>
                        <span className="thread-message-time">{formatTime(message.created_at)}</span>
                      </div>
                    ))
                  )}
                  <div ref={bottomRef} />
                </div>

                <form className="thread-compose" onSubmit={handleSend}>
                  <input
                    type="text"
                    placeholder="Type a message…"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    aria-label="Message"
                    disabled={isSending}
                  />
                  <button type="submit" className="btn-primary" disabled={isSending || !draft.trim()}>
                    Send
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      </main>

      <ChatbotWidget />
    </div>
  )
}

export default MessagesPage
