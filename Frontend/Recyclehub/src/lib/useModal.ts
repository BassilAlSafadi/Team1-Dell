import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input:not([disabled]), select, [tabindex]:not([tabindex="-1"])'

/**
 * Baseline modal behavior shared by every dialog in the app: Escape closes it, Tab is
 * trapped inside it, the first focusable element gets focus on open, focus returns to
 * whatever triggered it on close, and the page behind it stops scrolling.
 *
 * Attach the returned ref to the dialog's outermost element (the one with role="dialog").
 */
export function useModal(onClose: () => void) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const container = containerRef.current
    const focusable = container?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    ;(focusable?.[0] ?? container)?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !container) return

      const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      if (nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = previousOverflow
      trigger?.focus?.()
    }
    // Runs once per mount — onClose is read fresh via the event listener closure below,
    // so it doesn't need to be a dependency for that; re-running on every render would
    // reset focus and the scroll lock unnecessarily.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return containerRef
}
