import type { EvidenceItem } from '../domain/evidence.js';
import type { Inquiry, InquiryDraft } from '../domain/inquiry.js';
import type { KnowledgeCircuitFeedbackRef } from '../domain/knowledgeCircuit.js';
import { WorkItemLock } from './workItemLock.js';

/** Google Sheets 저장소가 workflow에 제공해야 하는 최소 기능입니다. */
export interface SheetPort {
  ensureManagedColumns(): Promise<void>;
  findInquiryByRow(rowNumber: number): Promise<Inquiry | null>;
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
  private readonly processingLock: WorkItemLock;

  constructor(
    private readonly sheets: SheetPort,
    private readonly drafts: DraftPort,
    private readonly discord: DiscordReviewPort,
    processingLock?: WorkItemLock,
  ) {
    this.processingLock = processingLock ?? new WorkItemLock();
  }

  /**
   * 신규 문의를 한 번 조회하고 각 문의를 review 대기 상태까지 진행합니다.
   *
   * @returns 모든 신규 문의 처리 시도가 끝나면 resolve됩니다.
   */
  async pollOnce(): Promise<void> {
    await this.sheets.ensureManagedColumns();
    const inquiries = await this.sheets.listNewInquiries();

    for (const inquiry of inquiries) {
      try {
        await this.processQueuedInquiry(inquiry);
      } catch {
        // Polling은 다른 문의 처리까지 계속 진행해야 합니다.
      }
    }
  }

  /**
   * Google Form submit webhook이 전달한 단일 row를 review 대기 상태까지 진행합니다.
   *
   * @param rowNumber - Google Sheet의 1-based row 번호
   * @returns 신규 문의를 실제 처리했으면 `true`, 이미 처리된 row면 `false`
   */
  async processSubmittedRow(rowNumber: number): Promise<boolean> {
    await this.sheets.ensureManagedColumns();
    const inquiry = await this.sheets.findInquiryByRow(rowNumber);

    if (!inquiry || !isPreReviewRetryableStatus(inquiry.status)) {
      return false;
    }

    await this.processQueuedInquiry(inquiry);
    return true;
  }

  private async processQueuedInquiry(inquiry: Inquiry): Promise<void> {
    const lockKey = `row:${inquiry.rowNumber}`;
    const lockResult = await this.processingLock.tryAcquire(lockKey, 'workflow');

    if (!lockResult.acquired) {
      return;
    }

    try {
      await this.processNewInquiry(inquiry);
    } catch (error) {
      await this.markInquiryFailed(inquiry, error);
      throw error;
    } finally {
      this.processingLock.release(lockKey, 'workflow');
    }
  }

  /** 단일 문의를 drafting -> pending_review 상태로 전이합니다. */
  private async processNewInquiry(inquiry: Inquiry): Promise<void> {
    await this.sheets.updateManagedFields(inquiry.rowNumber, {
      error_message: '',
      inquiry_id: inquiry.inquiryId,
      status: 'drafting',
    });

    const draft = await this.drafts.generateDraft(inquiry);
    const review = await this.discord.postReview(inquiry, draft);

    await this.sheets.updateManagedFields(inquiry.rowNumber, {
      status: 'pending_review',
      draft_subject: draft.subject,
      draft_body: draft.body,
      evidence_feedback_refs: serializeEvidenceFeedbackRefs(draft.evidenceReview?.evidence ?? []),
      discord_channel_id: review.channelId,
      discord_message_id: review.messageId,
      error_message: '',
    });
  }

  private async markInquiryFailed(inquiry: Inquiry, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);

    await this.sheets.updateManagedFields(inquiry.rowNumber, {
      error_message: message,
      status: 'failed',
    });
  }
}

function isPreReviewRetryableStatus(status: Inquiry['status']): boolean {
  return status === 'drafting' || status === 'failed' || status === 'new';
}

function serializeEvidenceFeedbackRefs(evidence: EvidenceItem[]): string {
  const refs: KnowledgeCircuitFeedbackRef[] = evidence
    .filter((item): item is EvidenceItem & { circuitNodeId: string; circuitContentHash: string } => (
      Boolean(item.circuitNodeId) && Boolean(item.circuitContentHash)
    ))
    .map((item) => ({
      nodeId: item.circuitNodeId,
      sourceType: item.sourceType,
      sourceRef: item.source,
      contentHash: item.circuitContentHash,
    }));

  return refs.length > 0 ? JSON.stringify(refs) : '';
}
