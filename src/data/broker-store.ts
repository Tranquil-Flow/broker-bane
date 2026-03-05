import type { Broker, Region, RemovalMethod, BrokerTier } from "../types/broker.js";

export interface BrokerFilter {
  regions?: readonly Region[];
  tiers?: readonly number[];
  methods?: readonly RemovalMethod[];
  categories?: readonly string[];
  excludeIds?: readonly string[];
  requiresEmail?: boolean;
  hasSearchUrl?: boolean;
  difficulty?: readonly string[];
  publicDirectoryOnly?: boolean;
  parentCompany?: string;
}

export class BrokerStore {
  private readonly brokers: ReadonlyArray<Broker>;
  private readonly byId: ReadonlyMap<string, Broker>;

  constructor(brokers: readonly Broker[]) {
    this.brokers = brokers;
    this.byId = new Map(brokers.map((b) => [b.id, b]));
  }

  get size(): number {
    return this.brokers.length;
  }

  getById(id: string): Broker | undefined {
    return this.byId.get(id);
  }

  getAll(): readonly Broker[] {
    return this.brokers;
  }

  filter(criteria: BrokerFilter): readonly Broker[] {
    return this.brokers.filter((broker) => {
      if (criteria.regions?.length && !criteria.regions.includes(broker.region)) {
        return false;
      }
      if (criteria.tiers?.length && !criteria.tiers.includes(broker.tier)) {
        return false;
      }
      if (criteria.methods?.length && !criteria.methods.includes(broker.removal_method)) {
        return false;
      }
      if (criteria.categories?.length && !criteria.categories.includes(broker.category)) {
        return false;
      }
      if (criteria.excludeIds?.length && criteria.excludeIds.includes(broker.id)) {
        return false;
      }
      if (criteria.requiresEmail === true && !broker.email) {
        return false;
      }
      if (criteria.hasSearchUrl === true && !broker.search_url) {
        return false;
      }
      if (criteria.difficulty?.length && !criteria.difficulty.includes(broker.difficulty)) {
        return false;
      }
      if (criteria.publicDirectoryOnly === true && !broker.public_directory) {
        return false;
      }
      if (criteria.parentCompany && broker.parent_company !== criteria.parentCompany) {
        return false;
      }
      return true;
    });
  }

  search(query: string): readonly Broker[] {
    const q = query.toLowerCase();
    return this.brokers.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.domain.toLowerCase().includes(q) ||
        (b.parent_company?.toLowerCase().includes(q) ?? false) ||
        b.category.toLowerCase().includes(q)
    );
  }

  getCategories(): readonly string[] {
    return [...new Set(this.brokers.map((b) => b.category))].sort();
  }

  getByMethod(method: RemovalMethod): readonly Broker[] {
    return this.brokers.filter((b) => b.removal_method === method || b.removal_method === "hybrid");
  }

  getByTier(tier: BrokerTier): readonly Broker[] {
    return this.brokers.filter((b) => b.tier === tier);
  }

  getByParentCompany(name: string): readonly Broker[] {
    return this.brokers.filter((b) => b.parent_company === name);
  }

  getParentCompanyGroups(): ReadonlyMap<string, readonly Broker[]> {
    const groups = new Map<string, Broker[]>();
    for (const broker of this.brokers) {
      if (!broker.parent_company) continue;
      const list = groups.get(broker.parent_company);
      if (list) {
        list.push(broker);
      } else {
        groups.set(broker.parent_company, [broker]);
      }
    }
    return groups;
  }
}
