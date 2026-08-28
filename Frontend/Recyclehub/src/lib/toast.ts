/**
 * A minimal pub-sub toast queue. Kept outside React state so any module — a page, a
 * panel, an API helper — can call `toast.success(...)` / `toast.error(...)` without
 * threading a callback down through props. <ToastRegion /> (mounted once in App.tsx)
 * is the only subscriber that actually renders anything.
 */

type ToastKind = 'success' | 'error'
export type ToastItem = { id: number; kind: ToastKind; message: string }

type Listener = (toasts: ToastItem[]) => void

let toasts: ToastItem[] = []
let listeners: Listener[] = []
let nextId = 0

const AUTO_DISMISS_MS = 4500

function emit() {
  listeners.forEach((listener) => listener(toasts))
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.push(listener)
  listener(toasts)
  return () => {
    listeners = listeners.filter((l) => l !== listener)
  }
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

function push(kind: ToastKind, message: string) {
  const id = nextId++
  toasts = [...toasts, { id, kind, message }]
  emit()
  setTimeout(() => dismissToast(id), AUTO_DISMISS_MS)
}

export const toast = {
  success: (message: string) => push('success', message),
  error: (message: string) => push('error', message),
}
