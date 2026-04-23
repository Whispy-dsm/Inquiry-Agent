import type { Inquiry, InquiryDraft } from '../domain/inquiry.js';

/** Google Sheets 저장소가 workflow에 제공해야 하는 최소 기능입니다. */
export interface SheetPort {
  ensureManagedColumns(): Promise<void>;
  listNewInquiries(): Promise<Inquiry[]>;
  updateManagedFields(rowNumber: number, values: Record<string, string>): Promise<void>;
}

/** AI 초안 생성기가 workflow에 제공해야 하는 최소 기능입니다. */
export interface DraftPort {
  generateDraft(inquiry: Inquiry): Promise<InquiryDraft>;
}

/** Discord review queue가 workflow에 제공해야 하는 최소 기능입니다. */
export interface DiscordReviewPort {
  postReview(inquiry: Inquiry, draft: InquiryDraft): Promise<{ channelId: string; messageId: string }>;
}

/**
 * 신규 문의 polling부터 Discord review 등록까지의 핵심 처리 흐름입니다.
 *
 * @remarks
 * 발송은 하지 않고, AI 초안을 Discord 승인 대기 상태로 올리는 단계까지만 담당합니다.
 *
 * @public
 */
export class InquiryWorkflow {
  constructor(
    private readonly sheets: SheetPort,
    private readonly drafts: DraftPort,
    private readonly discord: DiscordReviewPort,
  ) {}

  /**
   * 신규 문의를 한 번 조회하고 각 문의를 review 대기 상태까지 진행합니다.
   *
   * @returns 모든 신규 문의 처리 시도가 끝나면 resolve됩니다.
   */
  async pollOnce(): Promise<void> {
    await this.sheets.ensureManagedColumns();
    const inquiries = await this.sheets.listNewInquiries();

    for (const inquiry of inquiries) {
      await this.processNewInquiry(inquiry);
    }
  }

  /** 단일 문의를 drafting -> pending_review 상태로 전이합니다. */
  private async processNewInquiry(inquiry: Inquiry): Promise<void> {
    await this.sheets.updateManagedFields(inquiry.rowNumber, {
      inquiry_id: inquiry.inquiryId,
      status: 'drafting',
    });

    const draft = await this.drafts.generateDraft(inquiry);
    const review = await this.discord.postReview(inquiry, draft);

    await this.sheets.updateManagedFields(inquiry.rowNumber, {
      status: 'pending_review',
      risk_level: draft.risk.level,
      risk_reasons: draft.risk.reasons.join(' | '),
      draft_subject: draft.subject,
      draft_body: draft.body,
      discord_channel_id: review.channelId,
      discord_message_id: review.messageId,
    });
  }
}
