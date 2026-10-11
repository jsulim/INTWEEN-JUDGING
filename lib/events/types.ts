// 대회별 소개(랜딩) 페이지 데이터. 지금은 lib/events/<slug>.ts 에 하드코딩하고,
// 이후 프로그램 관리에서 입력받아 DB 에 저장하는 방식으로 옮길 때 같은 모양을 그대로 쓴다.

export type EventTheme = {
  primary: string   // 주요 버튼·제목 강조
  deep: string      // 진한 배경(히어로 하단, 푸터)
  soft: string      // 연한 배경(섹션 구분)
  tint: string      // 카드·칩 배경
}

export type EventConfig = {
  slug: string
  host?: string             // 전용 하위 도메인 (Cloudflare CNAME + Vercel Domains 에 등록)
  programId?: string        // 연결된 심사 프로그램 — <host>/join 이 이 프로그램의 심사위원 가입으로 이어진다
  title: string             // 브라우저 탭 제목
  year: string
  region: string            // 히어로 첫 줄
  name: string              // 히어로 강조 줄
  stageLabel: string        // 히어로 마지막 줄
  summary: string
  poster?: string           // public 경로
  theme: EventTheme
  keyFacts: { label: string; value: string }[]
  about: { topic: string; fields: string[]; resources: string }
  hosts: { role: string; name: string }[]
  schedule: { label: string; date: string; desc: string; highlight?: boolean }[]
  timetable: { title: string; note?: string; rows: { time: string; item: string; desc?: string }[] }
  criteria: { name: string; points: string[] }[]
  judgingRules: { label: string; value: string }[]
  awards: { name: string; prize: string; count: string }[]
  awardsNote?: string
  teams: { team: string; idea: string; summary: string; fields: string[] }[]
  teamsNote?: string
  office: { name: string; phone: string; email: string; hours?: string }
}
