export function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

export function jitteredDelay(baseMs: number, jitterFraction: number): Promise<void> {
  const jitter = baseMs * jitterFraction;
  const delay = baseMs + (Math.random() * 2 - 1) * jitter;
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Math.floor(delay))));
}

export function exponentialBackoff(
  attempt: number,
  initialDelayMs: number,
  multiplier: number,
  jitterFraction: number
): number {
  const base = initialDelayMs * Math.pow(multiplier, attempt);
  const jitter = base * jitterFraction;
  return Math.floor(base + (Math.random() * 2 - 1) * jitter);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
