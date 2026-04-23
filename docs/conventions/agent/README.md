# Agent Convention Index

이 디렉터리는 문의 처리 에이전트 작업에 적용할 공통 컨벤션 문서 모음입니다.
특정 서버 프레임워크, 저장소, 클라우드 제공자, 언어에 묶인 규칙은 포함하지 않습니다.

## 읽는 순서

작업을 시작할 때는 이 인덱스를 먼저 열고, 작업 범위에 맞는 문서를 함께 읽은 뒤 해당 컨벤션을 따릅니다.

1. [Workflow](workflow.md): 문의 처리 흐름, 분석, 편집, 검증 흐름
2. [Architecture](architecture.md): 에이전트 구성 요소, 도구 경계, 상태 관리
3. [Implementation Patterns](implementation-patterns.md): 프롬프트, 분류, 도구 호출, 응답 생성, 에스컬레이션
4. [Knowledge and Data](knowledge-and-data.md): 지식 소스, 근거, 개인정보, 보존 정책
5. [Testing](testing.md): 평가 케이스, 회귀 테스트, 도구 연동 검증
6. [Git](git.md): 브랜치, 커밋 메시지, 커밋/푸시 제한

## 관리 규칙

- 이 문서는 문의 처리 에이전트의 공통 작업 기준입니다.
- 제품 전용 정책, 특정 채널 규칙, 운영 정책은 별도 문서로 분리하고 이 공통 문서에는 범용 규칙만 남깁니다.
- `AGENTS.md`와 `CLAUDE.md`에는 전체 컨벤션을 반복해서 적지 않고, 이 인덱스와 주제별 문서를 참조하도록 유지합니다.
