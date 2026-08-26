const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8080'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

let accessToken: string | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

type RequestOptions = {
  method?: string
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
  /** Send `body` as-is (e.g. FormData/Blob) instead of JSON-encoding it. */
  raw?: boolean
  signal?: AbortSignal
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
 * send {"error": "..."}; REST-proxied .NET routes send ProblemDetails {"status", "title"}. */
async function readErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json()
    if (typeof data.error === 'string') return data.error
    if (typeof data.title === 'string') return data.title
  } catch {
    // fall through to status text
  }
  return res.statusText || `Request failed with status ${res.status}`
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

  if (!res.ok) {
    throw new ApiError(res.status, await readErrorMessage(res))
  }

  if (res.status === 204) return undefined as T

  const contentType = res.headers.get('Content-Type') ?? ''
  if (!contentType.includes('application/json')) return undefined as T
  return (await res.json()) as T
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query']) => request<T>(path, { method: 'GET', query }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  postRaw: <T>(path: string, body: BodyInit, query?: RequestOptions['query']) =>
    request<T>(path, { method: 'POST', body, raw: true, query }),
}
