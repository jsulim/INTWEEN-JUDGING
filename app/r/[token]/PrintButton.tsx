'use client'

export default function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()}
      className="rounded-md border border-line bg-card px-3 py-1.5 text-sm font-semibold hover:bg-bg">인쇄 · PDF 저장</button>
  )
}
