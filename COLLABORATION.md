# 운영 데이터를 조회하며 대시보드 수정

공유받은 소스에서 화면·차트·기간 선택을 수정하면서 현재 운영 데이터를 볼 수 있습니다. 로컬 Vite 서버가 기존 대시보드 API로 로그인과 집계 요청을 전달합니다. Supabase 서버 키는 기존 서버에 남습니다.

## 실행

Node.js 24와 npm을 준비하고 압축을 푼 프로젝트 폴더에서 실행합니다.

```sh
npm ci
```

처음 받은 복사본에서 `collaboration.env.example`을 `.env.local`로 복사합니다. 기존 `.env.local`이 있다면 덮어쓰지 말고 `DASHBOARD_API_PROXY` 한 줄만 추가합니다.

```powershell
Copy-Item collaboration.env.example .env.local
npm run dev
```

터미널에 표시된 `http://127.0.0.1:...` 주소를 열고 **새 koket-dashboard-v2 운영 대시보드에 저장한 관리자 비밀번호**로 로그인합니다. 이 비밀번호는 소유자가 개발자에게 별도로 전달해야 하며 ZIP에는 없습니다. Supabase URL/키, DB 비밀번호, 세션 서명키는 필요하지 않습니다.

## 연결 범위

`로컬 수정 화면 → 로컬 Vite 프록시 → koket-dashboard-v2.vercel.app의 인증된 API → 운영 Supabase 집계`

- 전달 경로는 `/api/auth`, `/api/auth/status`, `/api/logout`, `/api/dashboard` 네 가지입니다. DB 테이블 직접 접근 경로는 전달하지 않습니다.
- 기존 서버가 로그인 확인과 데이터 조회를 수행합니다. 다른 로컬 서비스의 쿠키, Authorization, apikey 헤더는 전달하지 않습니다.
- 공유 개발 서버는 기본적으로 `127.0.0.1`에서만 엽니다. 로그인 세션을 다루므로 `--host 0.0.0.0`으로 공개하거나 터널로 공유하지 않습니다.
- HTTPS 운영 서버의 세션 쿠키를 로컬 HTTP에서 쓸 수 있도록 로컬 응답에서만 `Secure`를 제거합니다. `HttpOnly`·`SameSite=Strict`·만료는 유지합니다. 운영 서버 설정은 변경하지 않습니다.
- 세션 만료 시 다시 로그인합니다. 로그아웃하면 로컬 세션 쿠키가 삭제됩니다. 현재 인증은 개인 계정이 아닌 공용 관리자 비밀번호이므로, 개발자별 권한 회수 기능은 없습니다.

## 무엇을 고칠 수 있나

`src/`의 화면과 데이터 표시 코드는 로컬 수정 즉시 반영됩니다. 서버·SQL 소스도 ZIP에 있지만, 이 모드에서는 데이터 계산을 운영 서버가 하므로 **로컬 `server/`, `worker/`, SQL 수정은 조회 결과에 반영되지 않습니다.** 서버 계산 수정은 포함된 테스트로 먼저 검증하고 소유자에게 변경 코드를 전달합니다. DB 권한·마이그레이션·배포는 별도 작업입니다.

로컬 API에서 직접 DB를 읽어야 하는 작업은 기존 README의 연결 방식을 따릅니다. `DASHBOARD_API_PROXY`를 제거하면 원래 로컬 서버 모드로 돌아갑니다. 운영 키를 공유 ZIP에 넣지 않습니다.

## 확인

```sh
node --test tests/dev-proxy.test.mjs
```

빌드·Vercel·Sites 배포에는 이 개발 프록시가 활성화되지 않습니다. `npm run preview` 대신 `npm run dev`로 공유 개발을 진행합니다. 운영 데이터나 기존 미구현 지표를 임의로 생성하지 않습니다.
