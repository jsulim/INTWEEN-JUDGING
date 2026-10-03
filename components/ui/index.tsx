// shadcn/ui 스타일의 최소 컴포넌트 세트. 브랜드 컬러는 globals.css 테마 변수에서 온다.
import Link from 'next/link'
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

export function cn(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(' ')
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
type Size = 'sm' | 'md' | 'lg'
const VARIANT: Record<Variant, string> = {
  primary: 'bg-primary text-primary-fg hover:bg-primary/90',
  secondary: 'bg-primary/10 text-primary hover:bg-primary/15',
  outline: 'border border-line bg-card hover:bg-bg',
  ghost: 'hover:bg-fg/5',
  danger: 'bg-danger text-white hover:bg-danger/90',
}
const SIZE: Record<Size, string> = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4', lg: 'h-12 px-6 text-base' }

export function buttonClass(variant: Variant = 'primary', size: Size = 'md') {
  return cn('inline-flex items-center justify-center gap-1.5 rounded-md font-semibold transition-colors',
    'disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap', VARIANT[variant], SIZE[size])
}

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }>(
  function Button({ variant = 'primary', size = 'md', className, ...props }, ref) {
    return <button ref={ref} className={cn(buttonClass(variant, size), className)} {...props} />
  })

export function LinkButton({ href, variant = 'primary', size = 'md', className, children }:
  { href: string; variant?: Variant; size?: Size; className?: string; children: ReactNode }) {
  return <Link href={href} className={cn(buttonClass(variant, size), className)}>{children}</Link>
}

const field = 'w-full rounded-md border border-line bg-card px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-bg disabled:text-muted'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(field, 'h-10', className)} {...props} />
  })

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(field, 'min-h-[88px]', className)} {...props} />
  })

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...props }, ref) {
    return <select ref={ref} className={cn(field, 'h-10', className)} {...props} />
  })

export function Label({ children, required, htmlFor, className }: { children: ReactNode; required?: boolean; htmlFor?: string; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn('mb-1 block text-sm font-semibold', className)}>
      {children}{required && <span className="ml-0.5 text-danger">*</span>}
    </label>
  )
}

export function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <Label required={required}>{label}</Label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  )
}

export function Card({ children, className, title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={cn('rounded-lg border border-line bg-card', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="font-bold">{title}</h2>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  )
}

type Tone = 'neutral' | 'primary' | 'accent' | 'highlight' | 'danger'
const TONE: Record<Tone, string> = {
  neutral: 'bg-fg/5 text-muted',
  primary: 'bg-primary/10 text-primary',
  accent: 'bg-accent/15 text-accent',
  highlight: 'bg-highlight/20 text-[#8a5a00]',
  danger: 'bg-danger/10 text-danger',
}
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap', TONE[tone], className)}>{children}</span>
}

export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {back && <Link href={back.href} className="mb-1 inline-block text-sm text-muted hover:text-fg">← {back.label}</Link>}
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && <p className="mt-1 text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-x-auto rounded-lg border border-line bg-card', className)}>
      <table className="w-full text-sm [&_td]:border-t [&_td]:border-line [&_td]:px-3 [&_td]:py-2.5 [&_th]:bg-bg [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:text-muted [&_th]:whitespace-nowrap">
        {children}
      </table>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line bg-card p-10 text-center text-muted">{children}</div>
}

export function Alert({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <div className={cn('rounded-md px-4 py-3 text-sm', TONE[tone])}>{children}</div>
}

export function Progress({ value, max, tone = 'accent' }: { value: number; max: number; tone?: 'accent' | 'highlight' }) {
  const pct = max ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-fg/10">
        <div className={cn('h-full rounded-full transition-all', tone === 'accent' ? 'bg-accent' : 'bg-highlight')} style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular w-20 text-right text-xs text-muted">{value}/{max} ({pct}%)</span>
    </div>
  )
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'highlight' | 'accent' }) {
  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className={cn('tabular mt-1 text-2xl font-bold', tone === 'highlight' && 'text-[#b07a00]', tone === 'accent' && 'text-accent')}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  )
}
