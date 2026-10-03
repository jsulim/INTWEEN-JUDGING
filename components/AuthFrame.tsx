import type { ReactNode } from 'react'

export default function AuthFrame({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-2xl font-black tracking-tight text-primary">INTWEEN</div>
          <div className="text-sm text-muted">심사 관리 플랫폼</div>
        </div>
        <div className="rounded-lg border border-line bg-card p-6 shadow-sm">
          <h1 className="text-xl font-bold">{title}</h1>
          {subtitle && <p className="mb-5 mt-1 text-sm text-muted">{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
  )
}
