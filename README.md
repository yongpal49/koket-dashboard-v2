# KOKET 운영 대시보드 v2

기존 대시보드와 분리해 Figma `KOKET 운영 대시보드 · 완성본`을 기준으로 새로 만든 관리자용 대시보드입니다.

## 화면

- 핵심 현황
- 회원·활성·리텐션 (플랫폼·앱 버전 포함)
- 상품·공급
- 찜·거래·채팅·후기 (거래 장소·시간대 포함)
- 퍼널

## Supabase 연결

`.env.example`을 `.env.local`로 복사한 뒤 `SUPABASE_URL`과 `SUPABASE_SECRET_KEY`를 입력합니다.

Secret key는 브라우저 코드에 포함되지 않고 `/api/dashboard` 서버 라우트에서만 사용됩니다. 기존 프로젝트의 legacy `SUPABASE_SERVICE_ROLE_KEY`도 호환하지만, 신규 프로젝트는 `sb_secret_...` 형식의 Secret key 사용을 권장합니다. 연결 정보가 없거나 호출이 실패하면 예시 데이터로 전환합니다.

Secret key는 RLS를 우회하므로 채팅, Git, 프런트엔드 코드에 넣지 않습니다. 관리자 인증을 붙이기 전에는 이 대시보드를 공개 배포하지 않습니다.

## 관리자 접근 보호

공용 관리자 비밀번호는 코드가 아닌 서버 환경변수로 관리합니다.

```env
DASHBOARD_PASSWORD=관리자용_강력한_비밀번호
DASHBOARD_SESSION_SECRET=무작위_64자_이상_문자열
```

로그인 성공 시 12시간 동안 유지되는 `HttpOnly`, `SameSite=Strict` 세션 쿠키를 사용합니다. `/api/dashboard`도 유효한 관리자 세션이 없는 요청을 거부합니다.

같은 인증 흐름을 로컬 Vite 서버, Sites Worker, Vercel Functions에서 지원합니다. Vercel에서는 배포 프로젝트의 Environment Variables에 위 네 값을 등록해야 합니다.

Vercel 배포 설정은 `vercel.json`에 포함되어 있습니다. Framework Preset은 `Vite`, Root Directory는 프로젝트 최상위 폴더를 사용합니다.

사용 RPC: `get_dashboard_core`, `get_dashboard_members`, `get_dashboard_supply`, `get_dashboard_engagement`, `get_dashboard_funnels`, `get_dashboard_operations`.

## 실행 및 확인

```bash
npm install
npm run dev
npm run build
npm run test:auth
npm run test:sites
```
