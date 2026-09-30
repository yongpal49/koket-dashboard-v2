# KOKET 운영 대시보드

운영 화면: https://koket-dashboard-v2.vercel.app/

2026-09-28에 배포·실데이터 확인한 화면과 서버 집계 소스입니다. 생활관·프로필 공개 설정·상품 누적 조회수·신고 유형과 상태·알림 읽음률을 포함합니다.

## 다른 컴퓨터에서 시작하기

Node.js 24와 npm을 사용합니다. 저장소를 처음 받는 경우:

```sh
git clone https://github.com/yongpal49/koket-dashboard-v2.git
cd koket-dashboard-v2
npm ci
```

이미 받은 저장소는 작업 중인 변경을 보관한 후 `git pull --ff-only origin main`으로 갱신하고 `npm ci`를 실행합니다.

운영 데이터를 보며 화면을 수정하려면 처음 한 번만 `collaboration.env.example`을 `.env.local`로 복사합니다. 기존 `.env.local`이 있다면 덮어쓰지 말고 `DASHBOARD_API_PROXY`만 예시 값으로 설정합니다.

```powershell
Copy-Item collaboration.env.example .env.local
npm run dev
```

macOS/Linux에서는 복사 명령으로 `cp collaboration.env.example .env.local`을 사용합니다. 터미널에 표시된 로컬 주소에서 운영 대시보드 관리자 비밀번호로 로그인합니다. 이 모드는 Supabase 서버 키를 로컬에 보관하지 않고 운영 서버의 인증된 집계 API를 조회합니다. 자세한 범위는 [COLLABORATION.md](COLLABORATION.md)에 있습니다.

## 서버 집계까지 수정하는 경우

프록시 모드에서는 로컬 화면 수정만 반영되고 집계는 운영 서버에서 계산합니다. 로컬 `server/` 수정까지 검증하려면 프록시를 해제하고 `.env.example`을 참고해 서버 전용 환경변수를 설정합니다.

| 변수 | 용도 |
| --- | --- |
| `SUPABASE_URL` | 대상 Supabase 프로젝트 주소 |
| `SUPABASE_SECRET_KEY` | 서버용 Secret key; legacy `SUPABASE_SERVICE_ROLE_KEY`도 지원 |
| `DASHBOARD_PASSWORD` | 관리자 로그인 비밀번호 |
| `DASHBOARD_SESSION_SECRET` | 관리자 세션 서명키 |
| `DASHBOARD_DATA_SOURCE` | 운영과 동일한 `core-rpc` 또는 테이블 전용 `tables` |

실제 키와 비밀번호는 Git, 프런트 코드, `VITE_*` 환경변수에 넣지 않습니다. 연결 실패 시 예시 데이터로 대체하지 않습니다.

`core-rpc`는 핵심 현황에 기존 `get_dashboard_core` 함수를 사용하고 나머지는 직접 테이블 집계합니다. `tables`는 별도 RPC 없이 기존 테이블을 조회합니다. 미설정/`rpc` 및 Sites Worker는 기존 6개 RPC 방식입니다. 이 저장소에는 전체 KOKET 앱 스키마와 운영 데이터가 포함되지 않습니다.

## 검증

```sh
npm run build
node --test tests/*.test.mjs
```

인증·기간·프록시·테이블 집계·패키징 테스트는 합성 데이터를 사용합니다. SQL 검증은 다음 명령으로 격리 메모리 PostgreSQL에서 실행할 수 있습니다.

```sh
npm install --prefix .local-audit --no-save @electric-sql/pglite
node scripts/verify-sql.mjs
```

`tests/sql/core-fixture.sql`은 운영 DB에서 실행하지 않습니다. 합성 브라우저/API 검증용 `scripts/verify-preview.mjs`, `scripts/verify-preview-api.mjs`도 포함돼 있습니다.

## 배포와 남은 범위

- Vercel 프로젝트는 `koket-dashboard-v2`입니다. Production의 기존 서버 환경변수를 유지하고 이 저장소 소스로 배포합니다.
- 상품 조회수는 현재 남은 상품의 누적 열람입니다. 선택 기간 조회수나 순 방문자 수가 아닙니다.
- 생활관은 본인 선택값이며 거주 인증이 아닙니다. 상품 생활관은 상품에 저장된 공개값만 사용합니다.
- MAU·리텐션·일부 단계별 퍼널은 미구현이며 기록 부족과 측정된 0을 구분합니다.
- 전체 기간은 현재 최대 366일입니다.
- `supabase/migrations/20260928_dashboard_account_status.sql`은 준비 및 격리 검증된 후속 SQL이며 운영 DB에는 적용하지 않았습니다. 적용 전 최신 원격 정의를 대조해야 합니다. 새 생활관·조회수·신고 집계는 이 후속 SQL 없이 동작합니다.
- `design-qa.md`는 초기 화면 검증 기록입니다.
