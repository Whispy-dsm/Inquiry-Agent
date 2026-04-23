import { z } from 'zod';
import type { Inquiry, InquiryDraft } from '../domain/inquiry.js';
import { classifyRisk } from '../domain/risk.js';

const draftSchema = z.object({
  summary: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  missingInformation: z.array(z.string()).default([]),
});

export function buildDraftPrompt(inquiry: Inquiry, context: string[]): string {
  return [
    `Inquiry ID: ${inquiry.inquiryId}`,
    `Inquiry Type: ${inquiry.type}`,
    `Customer Name: ${inquiry.name}`,
    `Customer Email: ${inquiry.email}`,
    `Message:\n${inquiry.message}`,
    'Retrieved Context:',
    context.length > 0 ? context.map((item, index) => `${index + 1}. ${item}`).join('\n') : 'No context provided.',
    'Return a JSON object with summary, subject, body, and missingInformation.',
  ].join('\n\n');
}

export function parseDraftJson(inquiry: Inquiry, modelOutput: string): InquiryDraft {
  const risk = classifyRisk(inquiry);

  try {
    const parsed = draftSchema.parse(JSON.parse(extractJson(modelOutput)));

    return {
      inquiryId: inquiry.inquiryId,
      summary: parsed.summary,
      subject: parsed.subject,
      body: parsed.body,
      risk,
      missingInformation: parsed.missingInformation,
    };
  } catch {
    return {
      inquiryId: inquiry.inquiryId,
      summary: 'AI draft parsing failed',
      subject: '문의 확인 후 안내드리겠습니다',
      body: `${inquiry.name}님, 안녕하세요.\n\n문의해 주셔서 감사합니다. 남겨주신 내용은 담당자가 확인한 뒤 정확히 안내드리겠습니다.\n\n감사합니다.`,
      risk,
      missingInformation: ['AI draft could not be parsed.'],
    };
  }
}

function extractJson(value: string): string {
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');

  if (start === -1 || end === -1 || end < start) {
    return value;
  }

  return value.slice(start, end + 1);
}
