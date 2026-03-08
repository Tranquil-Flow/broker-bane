import type { Broker } from "../types/broker.js";

const DIFFICULTY_ORDER = { easy: 0, medium: 1, hard: 2, manual: 3 } as const;

function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled;
}

function getGroup(broker: Broker): string | undefined {
  return broker.parent_company ?? broker.subsidiary_of;
}

function spaceByParentCompany(queue: Broker[]): Broker[] {
  if (queue.length <= 1) return queue;

  const result = [...queue];

  for (let i = 1; i < result.length; i++) {
    const currGroup = getGroup(result[i]!);
    const prevGroup = getGroup(result[i - 1]!);

    if (!currGroup || !prevGroup || currGroup !== prevGroup) continue;

    // Find the nearest broker (forward) that doesn't share the same parent
    let swapIdx = -1;
    for (let j = i + 1; j < result.length; j++) {
      const candidateGroup = getGroup(result[j]!);
      if (candidateGroup !== currGroup) {
        swapIdx = j;
        break;
      }
    }

    if (swapIdx !== -1) {
      [result[i], result[swapIdx]] = [result[swapIdx]!, result[i]!];
    }
    // If no swap candidate found, leave as-is (best effort)
  }

  return result;
}

export function scheduleBrokers(brokers: readonly Broker[]): Broker[] {
  // Group by tier, then sort by difficulty within each tier
  const groups = new Map<number, Broker[]>();

  for (const broker of brokers) {
    const tier = broker.tier;
    if (!groups.has(tier)) groups.set(tier, []);
    groups.get(tier)!.push(broker);
  }

  const result: Broker[] = [];

  // Process tiers in order (1, 2, 3)
  for (const tier of [1, 2, 3]) {
    const tierBrokers = groups.get(tier) ?? [];

    // Group by difficulty within tier
    const byDifficulty = new Map<string, Broker[]>();
    for (const b of tierBrokers) {
      if (!byDifficulty.has(b.difficulty)) byDifficulty.set(b.difficulty, []);
      byDifficulty.get(b.difficulty)!.push(b);
    }

    // Sort by difficulty order, shuffle within each difficulty group
    const difficulties = [...byDifficulty.keys()].sort(
      (a, b) =>
        (DIFFICULTY_ORDER[a as keyof typeof DIFFICULTY_ORDER] ?? 99) -
        (DIFFICULTY_ORDER[b as keyof typeof DIFFICULTY_ORDER] ?? 99)
    );

    for (const diff of difficulties) {
      result.push(...shuffle(byDifficulty.get(diff)!));
    }
  }

  return spaceByParentCompany(result);
}
