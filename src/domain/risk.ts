import type { Inquiry, RiskAssessment } from './inquiry.js';

/** 사용자 메시지에서 고위험 문의를 감지하기 위한 보수적인 키워드 규칙입니다. */
const highRiskPatterns: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /개인정보|개인 정보|삭제|탈퇴|계정 삭제/i,
    reason: 'Personal data deletion requests require manual high-risk review.',
  },
  {
    pattern: /환불|결제|청구|영수증|구독/i,
    reason: 'Payment or refund inquiries require manual high-risk review.',
  },
  {
    pattern: /법적|소송|신고|분쟁/i,
    reason: 'Legal or dispute-related inquiries require manual high-risk review.',
  },
  {
    pattern: /보안|해킹|취약점|유출/i,
    reason: 'Security-related inquiries require manual high-risk review.',
  },
];

/** 문의 유형과 본문을 기준으로 Discord 승인 카드에 표시할 위험도를 결정합니다. */
export function classifyRisk(inquiry: Inquiry): RiskAssessment {
  const reasons: string[] = [];

  // OTHER는 범위가 넓고 정책/개인정보 이슈가 섞일 가능성이 높아 기본 고위험으로 둡니다.
  if (inquiry.type === 'OTHER') {
    reasons.push('OTHER inquiries require manual high-risk review.');
  }

  // 명시적인 민감 키워드는 유형과 무관하게 고위험으로 승격합니다.
  for (const item of highRiskPatterns) {
    if (item.pattern.test(inquiry.message)) {
      reasons.push(item.reason);
    }
  }

  // 여러 규칙이 동시에 맞아도 같은 이유는 한 번만 보여줍니다.
  if (reasons.length > 0) {
    return {
      level: 'high',
      reasons: Array.from(new Set(reasons)),
    };
  }

  // 현재 MVP에서는 명시적 위험 신호가 없는 문의를 low로 두고 사람 승인 게이트에서 최종 확인합니다.
  return {
    level: 'low',
    reasons: [],
  };
}
