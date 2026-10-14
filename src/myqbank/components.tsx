import { useId, useRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react'
import logo from './assets/myqbank-icon.png'
import { safePercent } from './contracts'
import './tokens.css'
import './components.css'

export type IconName = 'sun' | 'moon' | 'settings' | 'arrow' | 'back' | 'flag' | 'labs' | 'rail' | 'check' | 'close' | 'play'
const paths: Record<IconName, ReactNode> = {
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>,
  settings: <><path d="m9 3-.5 3-2 1L4 6 2 10l2.5 2L4 14l-2 1 2 4 3-1 2 1 .5 3h5l.5-3 2-1 3 1 2-4-2-1-.5-2 2.5-2-2-4-2.5 1-2-1-.5-3Z"/><circle cx="12" cy="12" r="3"/></>,
  arrow: <path d="m9 6 6 6-6 6"/>, back: <path d="m15 6-6 6 6 6"/>,
  flag: <path d="M5 21V4h12l-2 4 2 4H5"/>,
  labs: <><path d="M9 3h6m-5 0v6L4 19a1.5 1.5 0 0 0 1.4 2h13.2A1.5 1.5 0 0 0 20 19L14 9V3M7 15h10"/></>,
  rail: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></>,
  check: <path d="m5 12 4 4L19 6"/>, close: <path d="m6 6 12 12M18 6 6 18"/>,
  play: <path d="m8 5 11 7-11 7Z"/>,
}
export function Icon({ name }: { name: IconName }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}
export function Brand() {
  return <div className="mq-brand"><img src={logo} alt="" width="40" height="38"/><span>My Q Bank</span></div>
}
export function Button({ variant = 'ghost', className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  return <button type="button" {...props} className={`mq-button mq-button--${variant} ${className}`}>{children}</button>
}
export function Card({ className = '', children, ...props }: HTMLAttributes<HTMLElement>) {
  return <section {...props} className={`mq-card ${className}`}>{children}</section>
}
export function Chip({ selected, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return <button type="button" {...props} className="mq-chip" aria-pressed={selected}>{children}</button>
}
export function Segmented<T extends string>({ label, value, options, onChange, disabled = false }: {
  label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (value: T) => void; disabled?: boolean
}) {
  return <div className="mq-segmented" role="group" aria-label={label}>{options.map(option =>
    <button key={option.value} type="button" aria-pressed={option.value === value} disabled={disabled} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>
}
export function Progress({ value, max, label }: { value: number; max: number; label: string }) {
  const percentage = safePercent(value, max) ?? 0
  return <div className="mq-progress" role="progressbar" aria-label={label} aria-valuenow={Math.max(0, Math.min(max, value))} aria-valuemin={0} aria-valuemax={max || 1}>
    <span style={{ width: `${percentage}%` }}/>
  </div>
}
export function Rings({ used, total, correct, evaluated = used, compact = false }: { used: number; total: number; correct: number | null; evaluated?: number; compact?: boolean }) {
  const outer = safePercent(used, total) ?? 0
  const inner = correct === null ? null : safePercent(correct, evaluated)
  return <div className={`mq-rings ${compact ? 'mq-rings--compact' : ''}`} role="img" aria-label={`${used} of ${total} answered${inner === null ? '' : `; ${inner}% correct`}`}>
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <circle className="mq-ring-track" cx="60" cy="60" r="52"/><circle className="mq-ring-outer" cx="60" cy="60" r="52" pathLength="100" strokeDasharray={`${outer} 100`}/>
      <circle className="mq-ring-track" cx="60" cy="60" r="40"/>{inner !== null && <circle className="mq-ring-inner" cx="60" cy="60" r="40" pathLength="100" strokeDasharray={`${inner} 100`}/>}
    </svg><div><strong>{used}</strong><span>{compact ? `of ${total}` : 'answered'}</span></div>
  </div>
}
export function Tabs({ label, items, activeId, onChange, children }: {
  label: string; items: readonly { id: string; label: string }[]; activeId: string; onChange: (id: string) => void; children: ReactNode
}) {
  const prefix = useId()
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const active = items.some(item => item.id === activeId) ? activeId : items[0]?.id
  if (!items.length) return null
  if (items.length === 1) return <section className="mq-single-section" aria-label={items[0].label}>{children}</section>
  return <div className="mq-tabs">
    <div className="mq-tablist" role="tablist" aria-label={label}>{items.map((item, i) => <button key={item.id} ref={node => { refs.current[i] = node }}
      type="button" role="tab" id={`${prefix}-tab-${item.id}`} aria-selected={active === item.id} aria-controls={`${prefix}-panel`}
      tabIndex={active === item.id ? 0 : -1} onClick={() => onChange(item.id)} onKeyDown={event => {
        const next = event.key === 'ArrowRight' ? (i + 1) % items.length : event.key === 'ArrowLeft' ? (i + items.length - 1) % items.length : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : null
        if (next === null) return
        event.preventDefault(); onChange(items[next].id); refs.current[next]?.focus()
      }}><span className="mq-tab-number">{String(i + 1).padStart(2, '0')}</span>{item.label}</button>)}</div>
    <div className="mq-tabpanel" role="tabpanel" id={`${prefix}-panel`} aria-labelledby={`${prefix}-tab-${active}`} tabIndex={0}>{children}</div>
  </div>
}
export function StateMessage({ state, title, children, action }: {
  state: 'loading' | 'empty' | 'error'; title: string; children: ReactNode; action?: ReactNode
}) {
  return <div className={`mq-state mq-state--${state}`} role={state === 'error' ? 'alert' : 'status'}>
    {state === 'loading' && <span className="mq-loader" aria-hidden="true"/>}<h2>{title}</h2><p>{children}</p>{action}
  </div>
}
