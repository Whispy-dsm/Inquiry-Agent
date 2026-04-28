# CLAUDE.md

This file provides guidance to coding agents when working in this repository.

## 프로젝트 개요

Inquiry-Agent는 사용자의 문의사항을 접수하고, 분류하고, 필요한 근거를 확인한 뒤 응답하거나 에스컬레이션하는 에이전트를 만드는 프로젝트입니다.
구현 세부 기술은 저장소의 실제 코드와 설정 파일을 먼저 확인한 뒤 판단합니다.

## 공통 컨벤션 참조

로컬 [Agent Convention Index](docs/conventions/agent/README.md)는 문의 처리 에이전트 작업에 적용할 공통 기준입니다.
작업을 시작할 때는 인덱스를 먼저 읽고, 작업 주제에 맞는 문서를 추가로 읽은 뒤 해당 컨벤션을 따릅니다.

주제별 컨벤션:

- [Workflow](docs/conventions/agent/workflow.md)
- [Architecture](docs/conventions/agent/architecture.md)
- [Implementation Patterns](docs/conventions/agent/implementation-patterns.md)
- [Knowledge and Data](docs/conventions/agent/knowledge-and-data.md)
- [Testing](docs/conventions/agent/testing.md)
- [Git](docs/conventions/agent/git.md)

## 빠른 명령어

- 빌드, 테스트, 실행 명령은 저장소의 실제 빌드 도구와 README를 확인한 뒤 사용합니다.
- 언어, 런타임, 패키지 매니저를 추정하지 말고 저장소의 스크립트와 설정 파일을 기준으로 명령을 선택합니다.
- 변경 후에는 변경 범위에 가장 가까운 테스트부터 실행하고, 공통 코드나 설정을 건드렸다면 검증 범위를 넓힙니다.

## 최상위 필수 규칙

- 분석, 리뷰, 성능, 아키텍처, 보안, 리팩토링 제안 작업은 [Workflow](docs/conventions/agent/workflow.md)의 분석 우선 흐름을 따른다.
- 새 문의 처리 흐름, 분류 규칙, 도구 연동, 프롬프트를 추가할 때는 테스트나 평가 케이스를 함께 작성한다.
- 에이전트 응답은 확인된 근거와 정책을 기준으로 생성하고, 근거가 부족하면 추측하지 않고 확인 또는 에스컬레이션한다.
- 사용자 문의 원문, 개인정보, 내부 자료를 다룰 때는 최소 수집과 최소 노출 원칙을 따른다.
- 외부 도구나 지식 소스를 추가하거나 수정할 때는 입력, 출력, 실패 처리, 로그 정책을 함께 문서화한다.
- 공개 모듈, 프롬프트, 도구 계약, 평가 시나리오에는 프로젝트 스타일에 맞는 문서화를 작성한다.
- 커밋은 사용자가 요청할 때만 하고, 푸시는 사용자가 요청하지 않으면 하지 않는다.
