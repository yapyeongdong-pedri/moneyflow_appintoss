# Money Flow v1 구현 계획 (TDS + 비게임 심사체크 통합)

## Summary
- 목표: 개인 1인용 자산 흐름을 `구조 중심 그래프`로 관리하고, `PNG 저장 + Toss 공유`까지 제공.
- 확정 스택/전략:
  - `React + TypeScript + Vite`
  - 그래프 `React Flow`
  - 부채 노드 기본 표시
  - 테마 3종 유지, 단 `@toss/tds-colors` 토큰만 사용
- 심사 전략:
  - AppInToss 비게임 런치 체크리스트를 개발 단계부터 게이트로 내장
  - 핵심 기능은 미니앱 내부에서 완결(외부 이동 의존 금지)

## Key Implementation Changes
- **기반 및 구조**
  - 루트에 `TDSMobileAITProvider` 적용, UI는 `@toss/tds-mobile` 우선 사용.
  - 모듈: `domain(graph-model/validator/ops)`, `app(onboarding/canvas/share)`, `infra(environment/storage)`.
  - 환경 분기: `web / sandbox / toss` capability 기반 처리.

- **도메인 모델**
  - `FlowNode`: `income_source | asset_account | payment_instrument | expense_category | liability_bucket`
  - `FlowEdge`: `income_to_account | account_to_card | account_to_expense | card_to_expense | account_to_liability`
  - 검증: 연결 매트릭스, 중복 active 엣지 금지, 필수 필드/길이 제한, Undo/Redo 20.

- **UI/UX (TDS 기준)**
  - 온보딩: 템플릿 선택 + 리네임 + 첫 그래프 미리보기.
  - 메인 맵: React Flow 캔버스 + 선택 상세 패널.
  - 오버레이: `useDialog`, `useBottomSheet`, `useToast`만 사용 (`alert/confirm/prompt` 금지).
  - 노드 형태 고정, 테마는 TDS 토큰 세트로만 스위칭.

- **공유/내보내기**
  - PNG: 현재 뷰/전체 그래프 export.
  - Toss: 동적 import + `isSupported()` 후 `getTossShareLink()` -> `share()`.
  - Web: Web Share API fallback, 실패 시 다운로드/복사.

## Launch Compliance Gates (비게임 체크리스트 반영)
- **G1 네비게이션/컨테이너**
  - 공통 navigation bar 사용(`withBackButton=true`, `withHomeButton=true`), 커스텀 헤더/햄버거 금지.
  - 첫 화면 뒤로가기 시 새로고침이 아니라 미니앱 종료 동작 확인.
- **G2 라우팅/기능 URL**
  - 콘솔 등록 메인/기능 URL 모두 404 없이 동작.
  - 랜딩 -> 기능 화면 진입 경로 고정 및 회귀 테스트 추가.
- **G3 외부 링크/앱 설치 유도 금지**
  - 앱 설치 유도 문구/배너/스토어 링크 금지.
  - 핵심 플로우에서 외부 결제창/외부 사이트 의존 금지.
  - 공유 링크는 자사 URL 대신 Toss 공유 링크를 기본 사용.
- **G4 브랜드/메타 일치**
  - `granite.config.ts` 앱명, `<title>`, `og:title`, 공유 타이틀 동일 문자열 유지.
  - 브랜드 컬러 형식 및 로고(600x600) 제출 자산 체크리스트 포함.
- **G5 입력/접근성/뷰포트**
  - 핀치 줌 비활성(`user-scalable=no`), 텍스트 최소 크기/대비 준수.
  - TDS 타이포 스케일/컬러 토큰 강제(헥스 하드코딩 금지).
- **G6 SDK 사용 규약**
  - SDK 정적 import 금지(예외 규칙 제외), 동적 import + 지원 여부 가드.
  - Toss 미지원 환경에서 graceful fallback 필수.

## Test Plan
- **Unit**
  - 그래프 검증(연결 타입, 중복 엣지, 필수 필드)
  - 템플릿 생성/부채 경로 생성
  - 테마 매핑이 TDS 토큰만 참조하는지 검사
  - 환경 capability 분기 검사
- **Integration**
  - 온보딩 -> 첫 그래프 렌더 -> 저장/재진입 일관성
  - BottomSheet 편집/삭제 confirm/Toast 피드백
  - Toss 공유 분기 vs Web fallback 분기
- **E2E + 심사 리허설**
  - 3분 내 초기 설정 완료
  - `통장 -> 부채노드 -> 대출원리금` 경로 생성/편집
  - 심사 게이트 G1~G6 체크 자동/수동 점검 시트 통과

## Assumptions & Defaults
- v1은 1인용, 인증/클라우드 동기화 없음.
- 금액은 정산 데이터가 아닌 `amountHint` 텍스트 수준.
- 비게임 미니앱 제출을 목표로 TDS 적용을 필수 기준으로 운영.
- 출시 전 “심사 사전점검 체크리스트 문서”를 별도 산출물로 만들어 QA/제출에 재사용.
