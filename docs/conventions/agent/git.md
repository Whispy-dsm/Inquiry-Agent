# Agent Git Convention

## Push Tag Rule

Every push to a shared remote branch must have a semantic version git tag.
Use the `v{MAJOR}.{MINOR}.{PATCH}` format and push the tag together with the branch update.
If several commits are pushed as one deployment or release unit, tag the final commit of that pushed unit.
For issue or PR work, create the tag after the issue or PR scope is verified and merged or otherwise ready for release.

Do not use project names, branch names, issue numbers, or PR numbers as release tags.
Use issue and PR numbers in branch names, commit messages, and PR text instead.

## Commit Scope Rule

Split commits by reviewable concern. Do not put behavior changes, operational
documentation, repository hygiene, and agent task-memory updates into one commit
just because they were produced in the same working session.

Recommended split:

- Behavior fix or feature implementation with its closest tests.
- User-facing or operator-facing documentation updates.
- Repository hygiene such as `.gitignore`, generated-output ignores, or tooling config.
- Agent process memory such as `tasks/lessons.md` or task-log-only updates.

Keep tests with the behavior they prove unless the task is explicitly test-only.
Before committing multiple changed files, inspect `git diff --stat` and decide
whether a reviewer would want to accept or revert each concern independently.

## 브랜치 포맷

```text
Feature/{이슈번호}-{짧은-설명}
```

예시:

```text
Feature/5-add-inquiry-router
```

## 커밋 메시지 포맷

```text
<타입> : <설명>
<타입> ( #이슈번호 ) : <설명>
```

## 타입

- `feat`: 새로운 기능 추가
- `fix`: 버그 수정
- `refactor`: 코드 리팩토링
- `chore`: 빌드, 설정 파일 수정
- `docs`: 문서 수정
- `test`: 테스트 또는 평가 케이스 추가/수정
- `perf`: 성능 개선
- `style`: 코드 포맷 또는 스타일 변경
- `build`: 빌드 파일 또는 외부 종속성 변경
- `ci`: CI 설정 변경
- `revert`: 이전 변경 되돌리기
- `rename`: 파일 또는 폴더명 변경
- `remove`: 파일 삭제

## 예시

```text
feat ( #72 ) : 문의 분류 흐름 추가
fix : 근거 부족 문의의 자동 답변 방지
test : 결제 문의 에스컬레이션 평가 추가
```

## 버전 태그 규칙

새로운 이슈 또는 PR 단위 작업이 릴리스 가능한 상태로 완료된 뒤에는 버전 태그를 추가합니다.
Git 태그는 이슈나 PR 번호 추적용이 아니라 배포 가능한 버전 식별용으로만 사용합니다.

태그 포맷:

```text
v{MAJOR}.{MINOR}.{PATCH}
```

예시:

```text
v0.1.0
v0.2.0
v1.0.0
```

규칙:

- 이슈 또는 PR 작업이 검증 완료되고 릴리스 가능한 상태가 되면 semantic version 태그를 생성합니다.
- 기능 추가는 보통 `MINOR`, 버그 수정은 보통 `PATCH`, 호환성을 깨는 변경은 `MAJOR`를 올립니다.
- 이슈 번호와 PR 번호는 브랜치명, 커밋 메시지, PR 설명에서 추적하고 Git 태그에는 넣지 않습니다.
- 태그는 검증이 끝난 커밋에만 붙입니다.
- 태그 생성과 푸시는 사용자가 요청하거나 승인한 경우에만 수행합니다.
- 이미 같은 버전 태그가 있으면 덮어쓰지 말고 기존 태그가 가리키는 커밋을 먼저 확인합니다.

## 규칙

- 타입과 콜론(`:`) 사이에는 공백을 둡니다.
- 이슈 번호는 `( #번호 )` 형식을 사용합니다.
- 설명은 한글로 작성합니다.
- 이슈 본문은 필요한 내용만 간결하게 작성합니다.
- 커밋은 사용자가 요청할 때만 합니다.
- 푸시는 사용자가 요청하지 않으면 하지 않습니다.
