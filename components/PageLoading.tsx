// 화면 이동 중 표시 (loading.tsx 공용). 서버 응답을 기다리는 동안 버튼을 다시 누르지 않도록 즉시 보여준다
export default function PageLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-live="polite">
      <div className="flex items-center gap-3 text-muted">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-primary" aria-hidden />
        <span className="text-sm">불러오는 중…</span>
      </div>
    </div>
  )
}
