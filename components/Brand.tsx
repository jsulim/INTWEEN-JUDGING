'use client'
import { createContext, useContext, type ReactNode } from 'react'

// 화면 상단·로그인 카드에 표시할 브랜드. 대회 전용 주소로 들어오면 그 대회명, 아니면 INTWEEN.
export interface Brand {
  name: string // 굵게 표시 (예: INTWEEN, 2026 울진군 창업아이디어톤)
  sub: string  // 보조 문구 (예: 심사 관리 플랫폼)
}

export const DEFAULT_BRAND: Brand = { name: 'INTWEEN', sub: '심사 관리 플랫폼' }

const Ctx = createContext<Brand>(DEFAULT_BRAND)

export function BrandProvider({ brand, children }: { brand: Brand; children: ReactNode }) {
  return <Ctx.Provider value={brand}>{children}</Ctx.Provider>
}

export const useBrand = () => useContext(Ctx)
