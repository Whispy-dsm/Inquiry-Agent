# Whispy RAG Knowledge Pack

이 디렉터리는 Whispy 고객 문의 답변 초안을 만들 때 AI가 참고할 Markdown 지식 묶음입니다. 현재는 벡터 DB 없이도 `StaticContextProvider`나 수동 컨텍스트 주입에 사용할 수 있도록, 검색 단위가 잘 나뉘는 문서로 구성했습니다.

## 사용 원칙

- 답변은 이 디렉터리의 문서, Whispy Notion 문서, Whispy Flutter/Backend 코드에서 확인된 내용만 근거로 작성한다.
- 근거가 부족하면 기능을 단정하지 말고 “담당자가 확인 후 안내드리겠다”고 쓴다.
- 결제, 환불, 법적 분쟁, 보안, 개인정보 삭제, 계정 탈퇴는 자동 완료를 약속하지 말고 사람 검토로 넘긴다.
- 코드와 Notion이 다르면 현재 코드 구현을 더 높은 우선순위로 본다. 단, 제품 정책/고객 안내 문구는 Notion FAQ와 법적 문서를 우선한다.
- 사용자에게 내부 파일 경로, Notion URL, 구현 클래스명, 서버 설정, 운영 비밀값을 노출하지 않는다.

## 문서 목록

- `source-map.md`: 근거 출처, 우선순위, 충돌 처리 기준.
- `answer-policy.md`: 답변 톤, 금지 표현, 에스컬레이션 정책.
- `product-knowledge.md`: 고객에게 설명 가능한 Whispy 서비스 지식.
- `feature-api-map.md`: Flutter 화면/기능과 Backend API의 연결 지도.
- `inquiry-playbooks.md`: 문의 유형별 답변 초안 작성법.
- `retrieval-guide.md`: RAG 청킹, 메타데이터, 검색 쿼리 설계.

## 권장 검색 순서

1. 문의 유형을 `APP_ERROR`, `SERVICE_QUESTION`, `SUGGESTION`, `OTHER` 중 하나로 분류한다.
2. 위험 키워드가 있는지 본다: 개인정보, 삭제, 탈퇴, 환불, 결제, 구독, 법적, 소송, 신고, 보안, 해킹, 취약점, 유출.
3. `inquiry-playbooks.md`에서 답변 형태를 고른다.
4. 서비스 사용법 질문이면 `product-knowledge.md`를 먼저 검색한다.
5. 기능 동작 또는 API 질문이면 `feature-api-map.md`를 검색한다.
6. 정책/톤/금지사항은 항상 `answer-policy.md`로 최종 확인한다.

## 답변 초안 최소 구조

- `summary`: 고객 문의를 1문장으로 요약한다.
- `subject`: 고객이 바로 이해할 수 있는 한국어 제목을 쓴다.
- `body`: 짧고 정중하게 답변한다. 확인이 필요한 부분은 명시한다.
- `missingInformation`: 답변에 필요한 추가 정보가 있으면 배열로 적는다.

## 업데이트 기준

- Flutter 또는 Backend API가 바뀌면 `feature-api-map.md`를 같이 갱신한다.
- FAQ, 이용약관, 개인정보처리방침, 문의 정책이 바뀌면 `product-knowledge.md`와 `answer-policy.md`를 같이 갱신한다.
- 새 문의 유형이나 Google Form 문항이 바뀌면 `inquiry-playbooks.md`를 갱신한다.
