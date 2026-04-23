import type { Inquiry, RiskAssessment } from './inquiry.js';

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

export function classifyRisk(inquiry: Inquiry): RiskAssessment {
  const reasons: string[] = [];

  if (inquiry.type === 'OTHER') {
    reasons.push('OTHER inquiries require manual high-risk review.');
  }

  for (const item of highRiskPatterns) {
    if (item.pattern.test(inquiry.message)) {
      reasons.push(item.reason);
    }
  }

  if (reasons.length > 0) {
    return {
      level: 'high',
      reasons: Array.from(new Set(reasons)),
    };
  }

  return {
    level: 'low',
    reasons: [],
  };
}
