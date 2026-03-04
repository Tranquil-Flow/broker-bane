import type { Profile } from "../types/config.js";

const TEMPLATE_REGEX = /\{\{(\w+)\}\}/g;

const PROFILE_KEYS: ReadonlySet<string> = new Set([
  "first_name", "last_name", "email", "address", "city",
  "state", "zip", "country", "phone", "date_of_birth",
]);

export function resolveTemplateValue(template: string, profile: Profile): string {
  return template.replace(TEMPLATE_REGEX, (match, key: string) => {
    if (PROFILE_KEYS.has(key)) {
      const value = (profile as Record<string, unknown>)[key];
      return typeof value === "string" ? value : match;
    }
    return match;
  });
}
