/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // PDF 생성(동의서·평가표·심사평)에 쓰는 한글 폰트를 서버 번들에 포함
    outputFileTracingIncludes: {
      '/api/**/*': ['./node_modules/pretendard/dist/public/static/alternative/Pretendard-Regular.ttf',
                    './node_modules/pretendard/dist/public/static/alternative/Pretendard-Bold.ttf'],
    },
    serverComponentsExternalPackages: ['exceljs', 'pdf-lib', '@pdf-lib/fontkit'],
  },
  webpack: (config) => {
    config.resolve.alias.canvas = false // pdfjs-dist 의 node canvas 의존 제거
    return config
  },
}
export default nextConfig
