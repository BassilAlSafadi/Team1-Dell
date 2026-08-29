const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8080'

/** Turns a gateway-relative path (e.g. an `/api/uploads/…` attachment url) into an absolute
 * URL against the configured API base, for use as an `<img>`/`<video>`/`<a>` src. */
export const apiUrl = (path: string): string => new URL(path, API_BASE_URL).toString()

export type UploadedFile = { url: string; type: string; name: string; size: number }

export type ChatThreadSummary = {
  threadId: string
  title: string
  createdAt: string
  updatedAt: string
}

export type ChatHistoryMessage = {
  role: 'human' | 'ai'
  content: string
  mediaName: string
  mediaType: string
  createdAt: string
}

export type ChatThread = {
  threadId: string
  title: string
  messages: ChatHistoryMessage[]
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

let accessToken: string | null = null
let refreshToken: string | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function setRefreshToken(token: string | null) {
  refreshToken = token
}

type TokenPair = { accessToken: string; refreshToken: string }

let onTokensRefreshed: ((tokens: TokenPair) => void) | null = null
let onAuthExpired: (() => void) | null = null

/** Wired up once by AuthProvider so this module can persist a silent refresh and, failing
 * that, clear the session — without importing React/auth state into this plain module. */
export function setAuthHandlers(handlers: {
  onTokensRefreshed: (tokens: TokenPair) => void
  onAuthExpired: () => void
}) {
  onTokensRefreshed = handlers.onTokensRefreshed
  onAuthExpired = handlers.onAuthExpired
}

type RequestOptions = {
  method?: string
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
  /** Send `body` as-is (e.g. FormData/Blob) instead of JSON-encoding it. */
  raw?: boolean
  signal?: AbortSignal
  /** Internal — set on the retry attempt after a token refresh, to prevent refresh loops. */
  _isRetry?: boolean
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(path, API_BASE_URL)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

/** Normalizes the two error shapes the backend actually returns: gRPC-backed gateway routes
 * send {"error": "..."}; REST-proxied .NET routes send ProblemDetails {"status", "title"}.
 * A 400 from [ApiController]'s automatic model validation adds a per-field `errors` map on
 * top of that generic title (e.g. {"Password": ["...minimum length of 12..."]}) — without
 * surfacing it, every validation failure reads as the same unhelpful "One or more validation
 * errors occurred." regardless of which field or why. */
async function readErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json()
    if (data.errors && typeof data.errors === 'object') {
      const fieldMessages = Object.values(data.errors).flat().filter((m) => typeof m === 'string')
      if (fieldMessages.length > 0) return fieldMessages.join(' ')
    }
    if (typeof data.error === 'string') return data.error
    if (typeof data.title === 'string') return data.title
  } catch {
    // fall through to status text
  }
  return res.statusText || `Request failed with status ${res.status}`
}

// Ensures concurrent 401s trigger one refresh call, not one per in-flight request.
let refreshInFlight: Promise<TokenPair | null> | null = null

async function refreshAccessToken(): Promise<TokenPair | null> {
  if (!refreshToken) return null
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(buildUrl('/api/auth/refresh'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        })
        if (!res.ok) return null
        const data = (await res.json()) as TokenPair
        return data
      } catch {
        return null
      } finally {
        refreshInFlight = null
      }
    })()
  }
  return refreshInFlight
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  let body: BodyInit | undefined
  if (options.body !== undefined) {
    if (options.raw) {
      body = options.body as BodyInit
    } else {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(options.body)
    }
  }

  const res = await fetch(buildUrl(path, options.query), {
    method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
    headers,
    body,
    signal: options.signal,
  })

  // A 401 past this point is a session that's actually expired/invalid (as opposed to a
  // request made while logged out, where accessToken/refreshToken are both already null).
  if (res.status === 401 && !options._isRetry && refreshToken && path !== '/api/auth/refresh') {
    const refreshed = await refreshAccessToken()
    if (refreshed) {
      accessToken = refreshed.accessToken
      refreshToken = refreshed.refreshToken
      onTokensRefreshed?.(refreshed)
      return request<T>(path, { ...options, _isRetry: true })
    }
    onAuthExpired?.()
  }

  if (!res.ok) {
    throw new ApiError(res.status, await readErrorMessage(res))
  }

  if (res.status === 204) return undefined as T

  const contentType = res.headers.get('Content-Type') ?? ''
  if (!contentType.includes('application/json')) return undefined as T
  return (await res.json()) as T
}

export type ChatStreamEvent =
  | { type: 'delta'; text: string; threadId: string }
  | { type: 'reset'; threadId: string }
  | { type: 'done'; threadId: string }
  | { type: 'error'; message: string }

/** Streams POST /api/ai/chat/stream as Server-Sent Events, yielding one event per chunk.
 * `reset` means a backend model/key fallback retry restarted the reply from scratch — any
 * text already yielded for this turn should be discarded by the caller. Does not participate
 * in the 401-refresh-and-retry flow `request()` has; an expired token here just surfaces as
 * an `error` event, which is an acceptable rarity for one chat turn. */
export async function* streamChat(
  message: string,
  threadId: string | undefined,
  signal?: AbortSignal,
  media?: File,
): AsyncGenerator<ChatStreamEvent> {
  const headers: Record<string, string> = {}
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  // With an attachment the turn goes as multipart/form-data (message + threadId + media file);
  // the browser sets the Content-Type + boundary itself, so it must not be set here.
  let body: BodyInit
  if (media) {
    const form = new FormData()
    form.append('message', message)
    if (threadId) form.append('threadId', threadId)
    form.append('media', media)
    body = form
  } else {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify({ message, threadId })
  }

  let res: Response
  try {
    res = await fetch(buildUrl('/api/ai/chat/stream'), {
      method: 'POST',
      headers,
      body,
      signal,
    })
  } catch {
    yield { type: 'error', message: 'Could not reach the assistant. Please try again.' }
    return
  }

  if (!res.ok || !res.body) {
    yield { type: 'error', message: await readErrorMessage(res) }
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let sepIndex: number
    while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, sepIndex)
      buffer = buffer.slice(sepIndex + 2)

      const line = rawEvent.split('\n').find((l) => l.startsWith('data: '))
      if (!line) continue

      let payload: {
        error?: string
        textDelta?: string
        threadId?: string
        done?: boolean
        reset?: boolean
      }
      try {
        payload = JSON.parse(line.slice('data: '.length))
      } catch {
        continue
      }

      if (payload.error) {
        yield { type: 'error', message: payload.error }
        return
      }
      if (payload.reset) {
        yield { type: 'reset', threadId: payload.threadId ?? '' }
        continue
      }
      if (payload.done) {
        yield { type: 'done', threadId: payload.threadId ?? '' }
        continue
      }
      if (payload.textDelta) {
        yield { type: 'delta', text: payload.textDelta, threadId: payload.threadId ?? '' }
      }
    }
  }
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query']) => request<T>(path, { method: 'GET', query }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  postRaw: <T>(path: string, body: BodyInit, query?: RequestOptions['query']) =>
    request<T>(path, { method: 'POST', body, raw: true, query }),
  /** Uploads one file to the gateway blob store, returning its stored descriptor. */
  upload: (file: File, signal?: AbortSignal) => {
    const form = new FormData()
    form.append('file', file)
    return request<UploadedFile>('/api/uploads', { method: 'POST', body: form, raw: true, signal })
  },
}
