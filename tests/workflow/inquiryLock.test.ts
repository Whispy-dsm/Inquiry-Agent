import { describe, expect, it } from 'vitest';
import { InquiryLock } from '../../src/workflow/inquiryLock.js';

describe('InquiryLock', () => {
  it('should allow one holder per inquiry when another user tries to acquire it', async () => {
    // Arrange
    const target = new InquiryLock();

    // Act
    const first = await target.tryAcquire('inq_1', 'user_a');
    const second = await target.tryAcquire('inq_1', 'user_b');

    // Assert
    expect(first).toEqual({ acquired: true, holder: 'user_a' });
    expect(second).toEqual({ acquired: false, holder: 'user_a' });
  });

  it('should release a lock when the current holder finishes work', async () => {
    // Arrange
    const target = new InquiryLock();
    await target.tryAcquire('inq_1', 'user_a');

    // Act
    target.release('inq_1', 'user_a');
    const result = await target.tryAcquire('inq_1', 'user_b');

    // Assert
    expect(result).toEqual({ acquired: true, holder: 'user_b' });
  });
});
