# Whispy Feature And API Map

이 문서는 개발자/운영자용 내부 지식이다. 고객 답변에는 API 경로를 직접 노출하지 않는다.

## Flutter 화면 지도

| 영역 | Flutter route | 설명 |
| --- | --- | --- |
| 스플래시 | `/splash` | 앱 시작 화면 |
| 온보딩 | `/introduction` | 소개 화면 |
| 인증 메인 | `/user/main` | 로그인/회원가입 선택 |
| 이메일 로그인 | `/email/login` | 이메일 로그인 |
| 비밀번호 찾기 | `/find/password` | 비밀번호 초기화/변경 흐름 |
| OAuth 성공 | `/oauth/success` | 딥링크 `whispy://oauth/success` 처리 |
| 회원가입 | `/user/signup...` | 이름, 성별, 이메일, 인증, 비밀번호, 프로필, 완료 단계 |
| 홈 | `/main`, `/root` | 메인/탭 루트 |
| 음악 상세 | `/search/:id` | 음악 상세와 재생 |
| 집중 | `/main/study-purpose`, `/main/timer` | 집중 목적 선택과 타이머 |
| 수면 | `/main/sleep/splash`, `/main/sleep/alarm-setting`, `/main/sleep/session` | 수면 플로우 |
| 마이페이지 | `/mypage/...` | 알림, 공지, 계정, 설정, 통계, 기록, 좋아요, 약관, FAQ |

## 인증과 토큰

| 기능 | Backend API | Flutter 근거 | 비고 |
| --- | --- | --- | --- |
| 회원가입 | `POST /users/register` | `auth_remote_data_source.dart` | 이메일, 비밀번호, 이름, 프로필 이미지, 성별, FCM 토큰, 이벤트 동의 |
| 로그인 | `POST /users/login` | `auth_remote_data_source.dart` | 이메일, 비밀번호, FCM 토큰 필수 |
| 카카오 로그인 | `POST /users/oauth/kakao` | `auth_service.dart` | Kakao access token 사용 |
| OAuth 코드 교환 | `POST /users/oauth/exchange` | `auth_service.dart` | 딥링크 code를 JWT로 교환 |
| 토큰 재발급 | `PUT /users/reissue` | `auth_interceptor.dart` | `X-Refresh-Token` 헤더 사용 |
| 로그아웃 | `POST /users/logout` | `my_account_remote_data_source.dart` | 인증 필요 |
| 이메일 인증 발송 | `POST /auth/email/send` | `auth_remote_data_source.dart` | 이메일 인증 코드 발송 |
| 이메일 인증 검증 | `POST /auth/email/verify` | `auth_remote_data_source.dart` | 코드 검증 |
| 이메일 인증 상태 | `POST /auth/email/status` | Backend controller | 상태 확인 |
| 비밀번호 변경 | `POST /users/password/change` | Backend controller | 인증 사용자 |
| 비밀번호 초기화 | `PATCH /users/password/reset` | `auth_remote_data_source.dart` | 이메일 인증 기반 |

## 마이페이지와 계정

| 기능 | Backend API | 비고 |
| --- | --- | --- |
| 내 프로필 조회 | `GET /users/profile` | 이름, 프로필 이미지, 가입 후 경과일 등 |
| 내 계정 조회 | `GET /users/account` | 이메일, 이름, 프로필, 성별, OAuth 제공자 등 |
| 프로필 수정 | `PATCH /users/profile` | 이름, 프로필 이미지 URL, 성별 |
| FCM 토큰 갱신 | `PATCH /users/fcm-token` | 최신 기기 토큰 반영 |
| 회원 탈퇴 | `DELETE /users/withdrawal` | 고위험. 자동 완료 답변 금지 |
| 탈퇴 사유 저장 | `POST /withdrawal-reasons` | 탈퇴 흐름에서 사용 |

## 음악

| 기능 | Backend API | 비고 |
| --- | --- | --- |
| 제목 검색 | `GET /search/music?keyword={keyword}` | Pageable 지원 |
| 카테고리 검색 | `GET /search/music/category?musicCategory={category}` | Pageable 지원 |
| 음악 상세 | `GET /search/{id}` | 제목, 아티스트, 설명, 파일 경로, 길이, 카테고리, 이미지, 영상 |
| 좋아요 토글 | `POST /music-likes/{musicId}/toggle` | 사용자+음악 기준 |
| 내 좋아요 목록 | `GET /music-likes/my` | 음악 메타데이터 포함 |
| 좋아요 여부 | `GET /music-likes/{musicId}/check` | 상세 버튼 상태에 사용 |
| 청취 기록 저장 | `POST /listening-history/{musicId}` | 재생 기록 |
| 내 청취 기록 | `GET /listening-history/my` | 사용자별 분리 |
| 사운드스페이스 목록 | `GET /soundspace/music` | 내 공간의 음악 |
| 사운드스페이스 토글 | `POST /soundspace/toggle/{musicId}` | 추가/제거 |
| 사운드스페이스 여부 | `GET /soundspace/exists/{musicId}` | 버튼 상태 |
| 사운드스페이스 삭제 | `DELETE /soundspace/{musicId}` | 본인 항목 |

## 세션 기록

| 기능 | Backend API | 최소 저장 기준 | 요청 핵심 |
| --- | --- | --- | --- |
| 집중 저장 | `POST /focus-sessions` | 60초 이상 | `startedAt`, `endedAt`, `durationSeconds`, `tag` |
| 집중 목록 | `GET /focus-sessions` | Pageable | 로그인 사용자 기준 |
| 집중 상세 | `GET /focus-sessions/{focusSessionId}` | 본인 세션 | 상세 조회 |
| 집중 삭제 | `DELETE /focus-sessions/{focusSessionId}` | 본인 세션 | 204 |
| 수면 저장 | `POST /sleep-sessions` | 15분 이상 | `startedAt`, `endedAt`, `durationSeconds` |
| 수면 목록 | `GET /sleep-sessions` | Pageable | 로그인 사용자 기준 |
| 수면 상세 | `GET /sleep-sessions/{sleepSessionId}` | 본인 세션 | 상세 조회 |
| 수면 삭제 | `DELETE /sleep-sessions/{sleepSessionId}` | 본인 세션 | 204 |
| 명상 저장 | `POST /meditation-sessions` | 60초 이상 | `startedAt`, `endedAt`, `durationSeconds`, `breatheMode` |
| 명상 목록 | `GET /meditation-sessions` | Pageable | 로그인 사용자 기준 |
| 명상 상세 | `GET /meditation-sessions/{meditationSessionId}` | 본인 세션 | 상세 조회 |
| 명상 삭제 | `DELETE /meditation-sessions/{meditationSessionId}` | 본인 세션 | 204 |

## 통계

| 기능 | Backend API | 요청 |
| --- | --- | --- |
| 집중 요약 | `GET /statistics/focus` | `period`, `date` |
| 집중 비교 | `GET /statistics/focus/comparison` | `period`, `date` |
| 집중 일별 | `GET /statistics/focus/daily` | `period`, `date` |
| 수면 요약 | `GET /statistics/sleep` | `period`, `date` |
| 수면 비교 | `GET /statistics/sleep/comparison` | `period`, `date` |
| 수면 일별 | `GET /statistics/sleep/daily` | `period`, `date` |
| 주간 활동 존재 여부 | `GET /statistics/activity/weekly-exists` | 로그인 사용자 |
| 주간 활동 요약 | `GET /statistics/activity/weekly` | 로그인 사용자 |

## 알림과 토픽

| 기능 | Backend API | 비고 |
| --- | --- | --- |
| 알림 목록 | `GET /notifications` | 사용자 알림 |
| 읽지 않은 수 | `GET /notifications/unread/count` | 메인/알림 배지 |
| 읽음 처리 | `PATCH /notifications/{notificationId}/read` | 단건 |
| 모두 읽음 | `PATCH /notifications/read-all` | 전체 |
| 알림 삭제 | `DELETE /notifications/{notificationId}` | 단건 |
| 전체 삭제 | `DELETE /notifications` | 전체 |
| 토픽 구독 | `POST /topics/subscribe` | FCM 대상 반영 |
| 토픽 해제 | `POST /topics/unsubscribe` | FCM 대상 제외 |
| 내 구독 목록 | `GET /topics/subscriptions` | 사용자별 |

## 결제와 구독

| 기능 | Backend API | 비고 |
| --- | --- | --- |
| 구매 검증 | `POST /purchase/validate` | Google Play API 검증 |
| 현재 사용자 구독 목록 | `GET /subscriptions/me` | 코드 기준 |
| 현재 사용자 구독 상태 | `GET /subscriptions/me/status` | 코드 기준 |
| Google Play 웹훅 | `POST /webhook/google-play` | 서버 간 이벤트 |

Notion 일부 문서는 이메일 기반 `/subscriptions/user/{email}` 경로를 언급하지만, 현재 코드 기준은 `/subscriptions/me` 계열이다.

## 공지와 파일

| 기능 | Backend API | 비고 |
| --- | --- | --- |
| 공지 목록 | `GET /announcements` | 공개 조회 |
| 공지 상세 | `GET /announcements/{id}` | 공개 조회 |
| 파일 업로드 | `POST /files/upload` | 이미지 등 첨부 |
| 파일 삭제 | `DELETE /files` | URL 또는 식별자 기반 구현 확인 필요 |
| 공개 파일 조회 | `GET /file/{folder}/{fileName}` | 공개 파일 URL |

## 고객 답변에서 숨길 내용

- API 경로, DTO 필드명, enum 명칭, 코드 경로.
- 서버 내부 구조, Redis/R2/Flyway/FCM 같은 구현 세부사항.
- “Notion과 코드가 다르다”는 내부 충돌 표현.
