import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Handlebars from "handlebars";
import type { Profile } from "../types/config.js";
import { EmailError } from "../util/errors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = resolve(__dirname, "../../templates");

export interface TemplateVariables {
  BrokerName: string;
  FullName: string;
  FirstName: string;
  LastName: string;
  Email: string;
  Address?: string;
  City?: string;
  State?: string;
  ZipCode?: string;
  Country: string;
  Phone?: string;
  DateOfBirth?: string;
  Date: string;
  Year: string;
  Month: string;
}

// Cache: templateKey (e.g. "gdpr", "gdpr-2") -> compiled template
const templateCache = new Map<string, HandlebarsTemplateDelegate>();
// Cache: template base name -> variant count
const variantCountCache = new Map<string, number>();

function discoverVariantCount(name: string): number {
  const cached = variantCountCache.get(name);
  if (cached !== undefined) return cached;

  let count = 1;
  while (existsSync(resolve(TEMPLATE_DIR, `${name}-${count + 1}.hbs`))) {
    count++;
  }
  variantCountCache.set(name, count);
  return count;
}

/** djb2-style hash of a string -> unsigned 32-bit int */
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** Pick a 1-indexed variant number deterministically from a seed string. */
export function pickVariantIndex(seed: string, variantCount: number): number {
  if (variantCount <= 1) return 1;
  return (hashString(seed) % variantCount) + 1;
}

function templateKey(name: string, variant: number): string {
  return variant === 1 ? name : `${name}-${variant}`;
}

function getTemplate(name: string, variant: number): HandlebarsTemplateDelegate {
  const key = templateKey(name, variant);
  const cached = templateCache.get(key);
  if (cached) return cached;

  const fileName = variant === 1 ? `${name}.hbs` : `${name}-${variant}.hbs`;
  const templatePath = resolve(TEMPLATE_DIR, fileName);
  try {
    const source = readFileSync(templatePath, "utf-8");
    const compiled = Handlebars.compile(source);
    templateCache.set(key, compiled);
    return compiled;
  } catch (err) {
    throw new EmailError(`Failed to load template: ${key}`, err);
  }
}

export function buildTemplateVariables(
  profile: Profile,
  brokerName: string,
  contactEmail = profile.email,
): TemplateVariables {
  const now = new Date();
  return {
    BrokerName: brokerName,
    FullName: `${profile.first_name} ${profile.last_name}`,
    FirstName: profile.first_name,
    LastName: profile.last_name,
    Email: contactEmail,
    Address: profile.address,
    City: profile.city,
    State: profile.state,
    ZipCode: profile.zip,
    Country: profile.country,
    Phone: profile.phone,
    DateOfBirth: profile.date_of_birth,
    Date: now.toISOString().split("T")[0]!,
    Year: String(now.getFullYear()),
    Month: String(now.getMonth() + 1).padStart(2, "0"),
  };
}

export interface RenderedEmail {
  subject: string;
  body: string;
}

/**
 * Render a template, optionally selecting a variant by seed.
 * @param templateName - "gdpr" | "ccpa" | "generic"
 * @param variables - Handlebars variables
 * @param variantSeed - broker ID or any string; same seed always picks same variant
 */
export function renderTemplate(
  templateName: string,
  variables: TemplateVariables,
  variantSeed?: string
): RenderedEmail {
  const variantCount = discoverVariantCount(templateName);
  const variant = variantSeed ? pickVariantIndex(variantSeed, variantCount) : 1;

  const template = getTemplate(templateName, variant);
  const rendered = template(variables);

  // First line is "Subject: ...", rest is body
  const lines = rendered.split("\n");
  const subjectLine = lines[0] ?? "";
  const subject = subjectLine.replace(/^Subject:\s*/, "").trim();
  const body = lines.slice(1).join("\n").trimEnd();

  if (!subject) {
    throw new EmailError(`Template ${templateName}-${variant} rendered with empty subject`);
  }

  return { subject, body };
}

export function clearTemplateCache(): void {
  templateCache.clear();
  variantCountCache.clear();
}
