# Whispy RAG Retrieval Guide

## 목적

이 문서는 `docs/rag/` 문서를 벡터 DB 또는 정적 컨텍스트로 사용할 때의 청킹, 메타데이터, 검색 전략을 정의한다.

## 권장 청킹

- Markdown 헤딩 단위로 먼저 나눈다.
- 하나의 chunk는 한 기능, 한 정책, 한 답변 playbook만 담는다.
- 권장 chunk 크기: 한국어 기준 600-1200자.
- overlap은 80-150자 정도만 둔다.
- 표는 행 단위 의미가 깨지지 않게 같은 chunk에 유지한다.
- API 표는 기능 영역별로 분리한다: 인증, 계정, 음악, 세션, 통계, 알림, 결제, 공지/파일.

## 권장 메타데이터

```json
{
  "product": "Whispy",
  "doc_type": "policy | product_knowledge | feature_map | api_map | playbook | source_map",
  "audience": "customer | internal | developer",
  "risk": "low | medium | high",
  "feature": "auth | account | music | focus | sleep | meditation | statistics | notification | payment | privacy | inquiry",
  "source_priority": 1,
  "source_ref": "docs/rag/product-knowledge.md#음악",
  "last_verified": "2026-04-27"
}
```

## 검색 쿼리 확장

사용자 문의를 그대로 검색하지 말고, 아래처럼 내부 키워드를 추가한다.

| 사용자 표현 | 추가 검색어 |
| --- | --- |
| 로그인이 안 돼요 | auth, login, OAuth, 이메일, 비밀번호, 인증번호 |
| 인증번호가 안 와요 | email verification, auth/email/send, 스팸함, 재요청 |
| 기록이 안 보여요 | 데이터, 로그인 계정, 수면 기록, 집중 기록, 통계 |
| 잠 기록 | 수면 세션, sleep session, sleep statistics |
| 집중 타이머 | 집중 세션, focus session, focus statistics |
| 음악 저장 | 좋아요, 사운드스페이스, 청취 기록 |
| 결제했는데 안 돼요 | 구독, Google Play, 프리미엄, 구매 복원, high risk |
| 탈퇴하고 싶어요 | 회원 탈퇴, 개인정보 삭제, high risk |
| 알림이 안 와요 | FCM, 알림 권한, 토픽 구독, notification |

## 검색 결과 조합

1. `answer-policy.md`에서 위험도와 금지 표현을 확인한다.
2. `inquiry-playbooks.md`에서 문의 유형별 답변 구조를 가져온다.
3. `product-knowledge.md`에서 고객에게 말할 수 있는 설명을 가져온다.
4. 개발/운영 확인이 필요한 경우에만 `feature-api-map.md`를 가져온다.
5. 출처 충돌이 의심되면 `source-map.md`의 충돌 사항을 확인한다.

## 답변 생성 규칙

- 가져온 chunk가 0개면 구체 답변을 만들지 않는다.
- 가져온 chunk가 1개면 그 범위 안에서만 답한다.
- 서로 다른 chunk가 충돌하면 고객에게 확정 답변을 하지 않고 담당자 확인으로 넘긴다.
- API와 고객 FAQ가 함께 검색되면 고객 답변에는 FAQ 표현을 우선한다.
- API 경로는 내부 리뷰용 summary에는 넣을 수 있지만, 고객 본문에는 넣지 않는다.

## 고위험 재랭킹

다음 키워드가 있으면 관련 chunk를 최상위로 올린다.

- 개인정보, 개인 정보, 삭제, 탈퇴, 계정 삭제.
- 환불, 결제, 청구, 영수증, 구독, 프리미엄.
- 법적, 소송, 신고, 분쟁.
- 보안, 해킹, 취약점, 유출.

고위험이면 답변 생성 자체를 막는 것이 아니라, 자동 완료/확정 표현을 막고 Discord 리뷰에서 위험도를 명확히 표시한다.

## 정적 컨텍스트 사용 예

초기 MVP에서는 벡터 DB 없이 아래 문서의 핵심 chunk를 `StaticContextProvider`에 넣어도 된다.

- 서비스 질문: `answer-policy.md`, `product-knowledge.md`, `inquiry-playbooks.md`.
- 앱 오류: `answer-policy.md`, `product-knowledge.md#앱 오류 기본 안내`, `inquiry-playbooks.md#APP_ERROR`.
- 결제/구독: `answer-policy.md`, `product-knowledge.md#프리미엄과 구독`, `inquiry-playbooks.md#결제/구독 문의`.
- 개인정보/탈퇴: `answer-policy.md`, `product-knowledge.md#회원 탈퇴와 데이터`, `inquiry-playbooks.md#개인정보/탈퇴 문의`.

## 평가 질문 세트

- 앱이 느리거나 멈춰요.
- 로그인하면 화면이 하얗게 멈춰요.
- 인증번호가 안 와요.
- 카카오로 가입했는데 이메일 로그인이 안 돼요.
- 어젯밤 수면 기록은 어떻게 입력하나요?
- 집중 기록을 잘못 저장했어요.
- 좋아요와 사운드스페이스 차이가 뭔가요?
- 알림이 안 와요.
- 결제했는데 프리미엄이 적용되지 않아요.
- 제 개인정보를 삭제해주세요.
- 다크모드를 추가해주세요.

각 질문에 대해 금지 표현, 필요한 추가 정보, high risk 여부를 함께 평가한다.
