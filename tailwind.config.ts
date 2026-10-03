import type { Config } from 'tailwindcss'

// 인트윈 브랜드 3색 (개발 가이드 11장). 심사 화면은 장시간 열람하므로 색 사용 최소화.
// 색상 변경 시 app/globals.css 의 CSS 변수만 수정하면 전체에 반영된다.
const config: Config = {
  content: ['./components/**/*.{ts,tsx}', './app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: 'rgb(var(--primary) / <alpha-value>)', fg: 'rgb(var(--primary-fg) / <alpha-value>)' },
        accent: 'rgb(var(--accent) / <alpha-value>)',
        highlight: 'rgb(var(--highlight) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
        bg: 'rgb(var(--bg) / <alpha-value>)',
        fg: 'rgb(var(--fg) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        card: 'rgb(var(--card) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Pretendard Variable', 'Pretendard', '-apple-system', 'system-ui', 'sans-serif'],
      },
      fontSize: { base: ['15px', '1.6'] },
    },
  },
  plugins: [],
}
export default config
