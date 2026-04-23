import { describe, expect, it, vi } from 'vitest';
import { createWorkerApp } from '../src/worker.js';

describe('createWorkerApp', () => {
  it('should start the bot, run an initial poll, and schedule periodic polling', async () => {
    // Arrange
    const start = vi.fn().mockResolvedValue(undefined);
    const pollOnce = vi.fn().mockResolvedValue(undefined);
    const on = vi.fn();
    const setIntervalFn = vi.fn().mockReturnValue({}) as typeof setInterval;
    const app = createWorkerApp({
      bot: {
        start,
        client: { on },
      } as never,
      workflow: { pollOnce } as never,
      interactionHandler: vi.fn(),
      intervalMs: 30000,
      logger: { error: vi.fn(), info: vi.fn() } as never,
      setIntervalFn,
    });

    // Act
    await app.start();

    // Assert
    expect(start).toHaveBeenCalledOnce();
    expect(on).toHaveBeenCalledWith('interactionCreate', expect.any(Function));
    expect(pollOnce).toHaveBeenCalledOnce();
    expect(setIntervalFn).toHaveBeenCalledOnce();
  });
});
