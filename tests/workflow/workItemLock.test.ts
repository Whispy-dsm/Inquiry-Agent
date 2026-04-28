import { describe, expect, it } from 'vitest';
import { WorkItemLock } from '../../src/workflow/workItemLock.js';

describe('WorkItemLock', () => {
  it('should allow only one holder per work item', async () => {
    // Arrange
    const target = new WorkItemLock();

    // Act
    const first = await target.tryAcquire('row:2', 'worker_a');
    const second = await target.tryAcquire('row:2', 'worker_b');

    // Assert
    expect(first).toEqual({ acquired: true, holder: 'worker_a' });
    expect(second).toEqual({ acquired: false, holder: 'worker_a' });
  });

  it('should release a work item lock for the current holder', async () => {
    // Arrange
    const target = new WorkItemLock();
    await target.tryAcquire('row:2', 'worker_a');

    // Act
    target.release('row:2', 'worker_a');
    const result = await target.tryAcquire('row:2', 'worker_b');

    // Assert
    expect(result).toEqual({ acquired: true, holder: 'worker_b' });
  });
});
