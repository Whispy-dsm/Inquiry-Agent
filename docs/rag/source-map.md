# Whispy RAG Source Map

## 출처 우선순위

1. 현재 코드 구현
   - Flutter: `C:\Users\user\Desktop\Whispy_Flutter`
   - Backend: `C:\Users\user\Desktop\Whispy_BE`
2. Whispy Notion 제품/기능/FAQ/법적 문서
3. `Inquiry-Agent`의 문의 처리 코드와 운영 문서
4. 오래된 README 또는 일반 템플릿 문구

코드와 Notion이 충돌하면 고객에게는 확정 답변을 피하고 내부 검토로 넘긴다. 개발/운영자용 답변에서는 “현재 코드 기준”과 “Notion 명세 기준”을 분리해 말한다.

## 확인한 Notion 문서

- `Whispy`: 문서 허브. 음악, 개발, 명세서, 컨벤션, 릴리즈, 법적 문서, FAQ, 문의하기 문서를 연결한다.
- `기능명세서`: 백엔드 기능명세 DB의 상위 문서.
- `디자인 기능 명세서`: 디자인 기능명세 DB의 상위 문서.
- `아키텍처`: Backend는 Hexagonal Architecture, Ports & Adapters, Java 21, Spring Boot 3.4.5, MySQL, Redis, Flyway, FCM, R2, Sentry, Prometheus를 사용한다.
- `자주 묻는 질문`: 고객센터 FAQ와 서비스 사용법.
- `서비스이용약관`: 서비스 이용, 통지, 탈퇴, 책임, 광고, 준거법 기준.
- `개인정보처리방침`: 수집 항목, 보유 기간, 파기, 개인정보 처리 기준.
- 기능명세 세부 문서: 로그인/회원가입, 메인화면, 마이페이지, 문의하기, 음악 검색, 음악 좋아요, 청취 기록, 사운드스페이스, 집중 세션, 수면 세션, 명상 세션, 집중 통계, 수면 통계, 활동 통계, 토픽 구독, 공지사항, 구독 상태 조회.

## 확인한 Flutter 근거

- 프로젝트: Flutter SDK `^3.5.1`, 앱 이름 `whispy_app_service`.
- 주요 패키지: `go_router`, `dio`, `flutter_bloc`, `flutter_secure_storage`, `firebase_messaging`, `kakao_flutter_sdk`, `google_mobile_ads`, `audioplayers`, `flutter_markdown`.
- 라우팅: `lib/routes/app_routes.dart`, `lib/routes/route_generator.dart`.
- 네트워크: `lib/core/network/whispy_dio.dart`, `lib/core/network/auth_interceptor.dart`.
- 인증 토큰: access token은 `Authorization: Bearer ...`, refresh token 재발급은 `X-Refresh-Token` 헤더와 `PUT /users/reissue`.
- 주요 화면: splash, introduction, auth, signup, email login, OAuth success, main, root tabs, search detail, focus timer, sleep flow, notification, announcement, account, settings, my Whispy, focus/sleep stats, focus/sleep records, liked music, listening history, FAQ, terms, privacy.

## 확인한 Backend 근거

- 프로젝트: Java 21, Spring Boot 3.4.5.
- 아키텍처: domain별 `adapter/in`, `application/port/in`, `application/port/out`, `application/service`, `adapter/out`, `model`.
- 주요 도메인: user, auth, music, like, soundspace, history, focus session, sleep session, meditation session, statistics, notification, topic, payment, file, announcement, reason, admin.
- 테스트/문서 원칙: Service 생성 시 단위 테스트, Controller 변경 시 API document 인터페이스 관리, DB 변경 시 Flyway migration.
- 오류 코드: `global/exception/error/ErrorCode.java`에 도메인별 사용자 메시지가 정의되어 있다.

## 현재 Inquiry-Agent 근거

- 문의 유형: `APP_ERROR`, `SERVICE_QUESTION`, `SUGGESTION`, `OTHER`.
- 담당자 검토 기준: `OTHER`와 개인정보/삭제/탈퇴, 결제/환불/구독, 법적/분쟁, 보안/해킹/유출 키워드는 담당자 확인 문구로 처리한다.
- 처리 흐름: Google Form/Sheet row -> AI draft -> Discord 승인 -> Gmail 발송.
- 현재 정적 context provider는 모든 문의에 동일한 문자열 배열을 넣을 수 있는 구조다.

## 명시적 충돌 사항

- Notion 수면 세션 문서는 60초 미만 저장 제외로 설명하지만, 현재 Backend 코드는 수면 세션 최소 시간을 15분으로 둔다. 고객 답변에는 “수면 기록은 최소 기준을 충족해야 저장된다” 정도로 말하고, 정확한 초/분 기준이 필요하면 코드 기준 15분 또는 담당자 확인으로 처리한다.
- Notion 구독 상태 조회 문서는 `/subscriptions/user/{email}` 계열을 언급하지만, 현재 Backend 코드는 `GET /subscriptions/me`, `GET /subscriptions/me/status`를 제공한다. 고객에게 API 경로를 직접 말하지 않는다.
- Notion 문의하기 기능명세는 문의 도메인을 요구하지만, 현재 Backend 코드에는 문의 전용 도메인/컨트롤러가 없다. 현재 Inquiry-Agent는 Google Form/Sheet 기반으로 문의를 처리한다.

## 제외한 출처

- Notion 환경변수, 서버 SSH 키, 운영 yml, secret 페이지는 RAG 근거에서 제외한다.
- 로컬 `.env` 파일은 읽거나 답변 근거로 사용하지 않는다.
- 빌드 산출물, 캐시, `node_modules`, Flutter `build`, Dart `.dart_tool`, Java `build`는 지식 출처에서 제외한다.
