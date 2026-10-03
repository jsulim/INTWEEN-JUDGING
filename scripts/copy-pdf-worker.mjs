// PDF.js 워커를 public/ 으로 복사 (심사위원 뷰어 J-04에서 사용)
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
const src = 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'
if (existsSync(src)) {
  mkdirSync('public', { recursive: true })
  copyFileSync(src, 'public/pdf.worker.min.mjs')
}
