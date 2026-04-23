/** 문의 처리 lock 획득 결과입니다. */
export type LockResult =
  | { acquired: true; holder: string }
  | { acquired: false; holder: string };

/** 단일 worker 프로세스 안에서 Discord 중복 클릭에 의한 중복 발송을 막는 메모리 lock입니다. */
export class InquiryLock {
  private readonly holders = new Map<string, string>();

  /** 문의별로 한 명의 Discord 사용자만 처리 lock을 획득하게 합니다. */
  async tryAcquire(inquiryId: string, holder: string): Promise<LockResult> {
    const current = this.holders.get(inquiryId);

    if (current) {
      return { acquired: false, holder: current };
    }

    this.holders.set(inquiryId, holder);
    return { acquired: true, holder };
  }

  /** 현재 holder가 작업을 끝냈을 때만 lock을 해제합니다. */
  release(inquiryId: string, holder: string): void {
    if (this.holders.get(inquiryId) === holder) {
      this.holders.delete(inquiryId);
    }
  }
}
