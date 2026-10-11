'use client'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { useBrand } from '@/components/Brand'

export default function AuthFrame({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const brand = useBrand()
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 block text-center">
          <div className="text-2xl font-black tracking-tight text-primary">{brand.name}</div>
          <div className="text-sm text-muted">{brand.sub}</div>
        </Link>
        <div className="rounded-lg border border-line bg-card p-6 shadow-sm">
          <h1 className="text-xl font-bold">{title}</h1>
          {subtitle && <p className="mb-5 mt-1 text-sm text-muted">{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
  )
}
