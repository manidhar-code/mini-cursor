import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withBackoffFallback, isRetryable, type ProviderModel } from './index';

const chain: ProviderModel[] = [
  { provider: 'groq', model: 'a' },
  { provider: 'mistral', model: 'b' },
];

const retryable = () => new Error('429 rate limit exceeded');
const nonRetryable = () => new Error('401 invalid api key');

describe('isRetryable', () => {
  it('treats 429 and 5xx as retryable', () => {
    expect(isRetryable(new Error('HTTP 429'))).toBe(true);
    expect(isRetryable(new Error('HTTP 503'))).toBe(true);
    expect(isRetryable(new Error('server is overloaded, please try again'))).toBe(true);
  });
  it('treats auth/validation errors as not retryable', () => {
    expect(isRetryable(new Error('401 invalid api key'))).toBe(false);
    expect(isRetryable(new Error('400 bad request: missing field'))).toBe(false);
  });
});

describe('withBackoffFallback', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns immediately on first-candidate success — no delay incurred', async () => {
    const attempt = vi.fn().mockResolvedValue('ok');
    const result = await withBackoffFallback(chain, attempt);
    expect(result).toBe('ok');
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('falls through to the next candidate with no delay within the same pass', async () => {
    const attempt = vi.fn()
      .mockRejectedValueOnce(retryable())
      .mockResolvedValueOnce('ok-from-second');
    const promise = withBackoffFallback(chain, attempt);
    // Resolves without needing any fake-timer advance — same-pass fallback is immediate.
    await expect(promise).resolves.toBe('ok-from-second');
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('a non-retryable error fails immediately without trying the rest of the chain', async () => {
    const attempt = vi.fn().mockRejectedValue(nonRetryable());
    await expect(withBackoffFallback(chain, attempt)).rejects.toThrow('invalid api key');
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('after the whole chain fails retryably, waits ~1s then retries the whole chain again', async () => {
    const attempt = vi.fn()
      .mockRejectedValueOnce(retryable())   // pass 0, candidate 1
      .mockRejectedValueOnce(retryable())   // pass 0, candidate 2
      .mockResolvedValueOnce('ok-on-pass-2'); // pass 1, candidate 1
    const promise = withBackoffFallback(chain, attempt);

    // Let pass 0 run (both candidates, both reject) before advancing time.
    await vi.advanceTimersByTimeAsync(0);
    expect(attempt).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toBe('ok-on-pass-2');
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it('gives up after exhausting every backoff pass, throwing the last error', async () => {
    const attempt = vi.fn().mockRejectedValue(retryable());
    const promise = withBackoffFallback(chain, attempt);
    const assertion = expect(promise).rejects.toThrow('rate limit');
    await vi.runAllTimersAsync();
    await assertion;
    // 4 passes total (1 immediate + 3 backoff passes) x 2 candidates = 8 attempts
    expect(attempt).toHaveBeenCalledTimes(8);
  });
});
