import type { Inquiry, InquiryDraft } from '../domain/inquiry.js';

export interface SheetPort {
  ensureManagedColumns(): Promise<void>;
  listNewInquiries(): Promise<Inquiry[]>;
  updateManagedFields(rowNumber: number, values: Record<string, string>): Promise<void>;
}

export interface DraftPort {
  generateDraft(inquiry: Inquiry): Promise<InquiryDraft>;
}

export interface DiscordReviewPort {
  postReview(inquiry: Inquiry, draft: InquiryDraft): Promise<{ channelId: string; messageId: string }>;
}

export class InquiryWorkflow {
  constructor(
    private readonly sheets: SheetPort,
    private readonly drafts: DraftPort,
    private readonly discord: DiscordReviewPort,
  ) {}

  async pollOnce(): Promise<void> {
    await this.sheets.ensureManagedColumns();
    const inquiries = await this.sheets.listNewInquiries();

    for (const inquiry of inquiries) {
      await this.processNewInquiry(inquiry);
    }
  }

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
      risk_reasons: draft.risk.reasons.join(''),
      draft_subject: draft.subject,
      draft_body: draft.body,
      discord_channel_id: review.channelId,
      discord_message_id: review.messageId,
    });
  }
}
