import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string
          action: string
          theme: 'light'
          callback: (token: string) => void
          'expired-callback': () => void
          'error-callback': () => void
        }
      ) => string
      remove: (widgetId: string) => void
    }
  }
}

const SCRIPT_ID = 'cloudflare-turnstile-script'
const SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(
      SCRIPT_ID
    ) as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(), { once: true })
      return
    }
    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject()
    document.head.appendChild(script)
  })
}

export function TurnstileWidget({
  siteKey,
  action,
  onToken,
}: {
  siteKey: string | null
  action: 'recruitment-check' | 'recruitment-submit'
  onToken: (token: string | null) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!siteKey) {
      onToken(null)
      return
    }
    let disposed = false
    let widgetId: string | undefined
    void loadTurnstile()
      .then(() => {
        if (disposed || !containerRef.current || !window.turnstile) return
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action,
          theme: 'light',
          callback: (token) => onToken(token),
          'expired-callback': () => onToken(null),
          'error-callback': () => onToken(null),
        })
      })
      .catch(() => onToken(null))
    return () => {
      disposed = true
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId)
      onToken(null)
    }
  }, [action, onToken, siteKey])

  if (!siteKey) return null
  return (
    <div
      className='min-h-[66px] overflow-x-auto'
      aria-label='Verifikasi keamanan'
    >
      <div ref={containerRef} />
    </div>
  )
}
