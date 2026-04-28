import { describe, expect, it, vi } from 'vitest';
import { createWorkerApp } from '../src/worker.js';

describe('createWorkerApp', () => {
  it('should start the bot and webhook server without polling by default', async () => {
    // Arrange
    const start = vi.fn().mockResolvedValue(undefined);
    const startWebhook = vi.fn().mockResolvedValue(undefined);
    const pollOnce = vi.fn().mockResolvedValue(undefined);
    const on = vi.fn();
    const setIntervalFn = vi.fn().mockReturnValue({}) as typeof setInterval;
    const target = createWorkerApp({
      bot: {
        start,
        client: { on },
      } as never,
      workflow: { pollOnce } as never,
      webhookServer: { start: startWebhook },
      interactionHandler: vi.fn(),
      enableFallbackPolling: false,
      intervalMs: 30000,
      logger: { error: vi.fn(), info: vi.fn() } as never,
      setIntervalFn,
    });

    // Act
    await target.start();

    // Assert
    expect(start).toHaveBeenCalledOnce();
    expect(startWebhook).toHaveBeenCalledOnce();
    expect(on).toHaveBeenCalledWith('interactionCreate', expect.any(Function));
    expect(pollOnce).not.toHaveBeenCalled();
    expect(setIntervalFn).not.toHaveBeenCalled();
  });

  it('should run fallback polling only when enabled', async () => {
    // Arrange
    const start = vi.fn().mockResolvedValue(undefined);
    const startWebhook = vi.fn().mockResolvedValue(undefined);
    const pollOnce = vi.fn().mockResolvedValue(undefined);
    const on = vi.fn();
    const setIntervalFn = vi.fn().mockReturnValue({}) as typeof setInterval;
    const target = createWorkerApp({
      bot: {
        start,
        client: { on },
      } as never,
      workflow: { pollOnce } as never,
      webhookServer: { start: startWebhook },
      interactionHandler: vi.fn(),
      enableFallbackPolling: true,
      intervalMs: 30000,
      logger: { error: vi.fn(), info: vi.fn() } as never,
      setIntervalFn,
    });

    // Act
    await target.start();

    // Assert
    expect(pollOnce).toHaveBeenCalledOnce();
    expect(setIntervalFn).toHaveBeenCalledOnce();
  });
});
