import { readFileSync } from "node:fs";
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

const templateCache = new Map<string, HandlebarsTemplateDelegate>();

function getTemplate(name: string): HandlebarsTemplateDelegate {
  const cached = templateCache.get(name);
  if (cached) return cached;

  const templatePath = resolve(TEMPLATE_DIR, `${name}.hbs`);
  try {
    const source = readFileSync(templatePath, "utf-8");
    const compiled = Handlebars.compile(source);
    templateCache.set(name, compiled);
    return compiled;
  } catch (err) {
    throw new EmailError(`Failed to load template: ${name}`, err);
  }
}

export function buildTemplateVariables(
  profile: Profile,
  brokerName: string
): TemplateVariables {
  const now = new Date();
  return {
    BrokerName: brokerName,
    FullName: `${profile.first_name} ${profile.last_name}`,
    FirstName: profile.first_name,
    LastName: profile.last_name,
    Email: profile.email,
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

export function renderTemplate(
  templateName: string,
  variables: TemplateVariables
): RenderedEmail {
  const template = getTemplate(templateName);
  const rendered = template(variables);

  // First line is "Subject: ...", rest is body
  const lines = rendered.split("\n");
  const subjectLine = lines[0] ?? "";
  const subject = subjectLine.replace(/^Subject:\s*/, "").trim();
  const body = lines.slice(1).join("\n").trim();

  if (!subject) {
    throw new EmailError(`Template ${templateName} rendered with empty subject`);
  }

  return { subject, body };
}

export function clearTemplateCache(): void {
  templateCache.clear();
}
