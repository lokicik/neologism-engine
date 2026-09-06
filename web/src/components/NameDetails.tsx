import { useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import type { NameResult } from '../lib/engine'
import { NameCard } from './NameCard'

export function NameDialog({ title, label, onClose, children, wide = false }: { title: string; label: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const id = useId()
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    const element = dialog.current!
    document.body.style.overflow = 'hidden'
    element.showModal()
    return () => {
      element.close(); document.body.style.overflow = overflow
      const target = previous?.isConnected ? previous : document.getElementById('main-content')
      target?.focus({ preventScroll: true })
    }
  }, [])
  return <dialog ref={dialog} className={`name-dialog${wide ? ' comparison-dialog' : ''}`} aria-labelledby={id} onCancel={event => { event.preventDefault(); onClose() }} onClick={event => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (event.target === event.currentTarget && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) onClose()
  }}>
    <header className="name-dialog-header"><h2 id={id}>{title}</h2><button className="dialog-close" onClick={onClose} aria-label={`Close ${label}`}><svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></button></header>
    <div className="name-dialog-body">{children}</div>
  </dialog>
}

export function NameDetails({ result, saved, rejected, onSave, onRejected, onClose, imported = false }: {
  result: NameResult; saved: boolean; rejected?: boolean; onSave: (result: NameResult) => void
  onRejected?: (result: NameResult) => void; onClose: () => void; imported?: boolean
}) {
  return <NameDialog title={result.name} label="details" onClose={onClose}>
    <NameCard result={result} isFavorite={saved} onToggleFavorite={onSave} isRejected={rejected} onToggleRejected={onRejected} metricsAvailable={!imported} detailView />
  </NameDialog>
}
