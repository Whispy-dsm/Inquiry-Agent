export type LockResult =
  | { acquired: true; holder: string }
  | { acquired: false; holder: string };

export class InquiryLock {
  private readonly holders = new Map<string, string>();

  async tryAcquire(inquiryId: string, holder: string): Promise<LockResult> {
    const current = this.holders.get(inquiryId);

    if (current) {
      return { acquired: false, holder: current };
    }

    this.holders.set(inquiryId, holder);
    return { acquired: true, holder };
  }

  release(inquiryId: string, holder: string): void {
    if (this.holders.get(inquiryId) === holder) {
      this.holders.delete(inquiryId);
    }
  }
}
