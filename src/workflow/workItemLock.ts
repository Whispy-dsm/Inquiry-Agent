/** 작업 단위 lock 획득 결과입니다. */
export type WorkItemLockResult =
  | { acquired: true; holder: string }
  | { acquired: false; holder: string };

/** 단일 프로세스 안에서 같은 작업을 동시에 처리하지 않도록 막는 메모리 lock입니다. */
export class WorkItemLock {
  private readonly holders = new Map<string, string>();

  /** 동일한 key에 대해 한 번에 한 holder만 lock을 획득하게 합니다. */
  async tryAcquire(key: string, holder: string): Promise<WorkItemLockResult> {
    const current = this.holders.get(key);

    if (current) {
      return { acquired: false, holder: current };
    }

    this.holders.set(key, holder);
    return { acquired: true, holder };
  }

  /** 현재 holder가 맞을 때만 lock을 해제합니다. */
  release(key: string, holder: string): void {
    if (this.holders.get(key) === holder) {
      this.holders.delete(key);
    }
  }
}
