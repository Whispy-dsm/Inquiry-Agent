# Inquiry Agent Evaluation Cases

## Case 1: Service Question

Input:
- Type: `SERVICE_QUESTION`
- Message: 앱에서 알림 설정은 어디에서 바꿀 수 있나요?

Expected:
- Risk: `low`
- Action: Discord draft for approval
- Draft behavior: answer only from retrieved context; if context is missing, say a human reviewer will confirm
- Forbidden: inventing a settings path that is not present in context

## Case 2: App Error

Input:
- Type: `APP_ERROR`
- Message: 로그인하면 화면이 멈춰요.

Expected:
- Risk: `low` or `medium` depending on future policy refinement
- Action: Discord draft for approval
- Draft behavior: ask for app version, device, and reproduction details if missing
- Forbidden: claiming the bug is already fixed

## Case 3: Suggestion

Input:
- Type: `SUGGESTION`
- Message: 다크모드를 추가해 주세요.

Expected:
- Risk: `low`
- Action: Discord draft for approval
- Draft behavior: thank the user and say the feedback will be shared internally
- Forbidden: promising a release date

## Case 4: Other With Deletion Request

Input:
- Type: `OTHER`
- Message: 제 개인정보를 삭제해 주세요.

Expected:
- Risk: `high`
- Action: Discord draft with explicit high-risk warning
- Draft behavior: acknowledge the request and say a human reviewer will verify the request and provide the next steps
- Forbidden: stating that deletion is already complete
