import yaml from "js-yaml";
import { z } from "zod";
import { PlaybookSchema, type Playbook } from "./schema.js";
import { PlaybookExecutor, type CaptchaHooks } from "./executor.js";
import type { Profile } from "../types/config.js";
import type { Broker } from "../types/broker.js";
import { logger } from "../util/logger.js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { waitForChallenge } from "../browser/block-detector.js";
import { loadProfileCookies, saveProfileCookies } from "../browser/session.js";

export interface FormField {
  selector: string;
  type: string;
  label?: string;
  placeholder?: string;
  name?: string;
  text?: string;
}

export interface FormStructure {
  inputs: FormField[];
  buttons: FormField[];
  checkboxes: FormField[];
  selects?: FormField[];
  multiStep?: boolean;
}

export interface GeneratorPromptInput {
  brokerId: string;
  brokerName: string;
  domain: string;
  optOutUrl: string;
  formHints?: string;
  formStructure: FormStructure;
}

export interface GenerateResult {
  playbook: Playbook | null;
  verified: boolean;
  error?: string;
}

const REFERENCE_PLAYBOOK = `# Example playbook (Spokeo)
broker_id: spokeo
version: 1
last_verified: "2026-03-08"
phases:
  - name: submit
    steps:
      - action: goto
        url: "https://www.spokeo.com/optout"
      - action: wait
        ms: 2000
      - action: fill
        selector: 'input[type="text"][required], input[placeholder*="URL"]'
        value: "https://www.spokeo.com/{{first_name}}-{{last_name}}"
      - action: fill
        selector: 'input[type="email"], input[name="email"]'
        value: "{{email}}"
      - action: click
        selector: 'button[type="submit"], button:has-text("Opt Out")'
      - action: wait
        ms: 3000
      - action: screenshot
        label: success`;

export function buildGeneratorPrompt(input: GeneratorPromptInput): string {
  const inputLines = input.formStructure.inputs.map(
    (f) => `  - selector: ${f.selector}, type: ${f.type}, label: ${f.label ?? "none"}, placeholder: ${f.placeholder ?? "none"}, name: ${f.name ?? "none"}`
  );
  const buttonLines = input.formStructure.buttons.map(
    (f) => `  - selector: ${f.selector}, text: ${f.text ?? f.label ?? "none"}`
  );
  const checkboxLines = input.formStructure.checkboxes.map(
    (f) => `  - selector: ${f.selector}, label: ${f.label ?? "none"}`
  );

  return [
    `Generate a BrokerBane playbook YAML for the following broker:`,
    ``,
    `Broker: ${input.brokerName} (${input.domain})`,
    `Opt-out URL: ${input.optOutUrl}`,
    `broker_id: ${input.brokerId}`,
    input.formHints ? `Form hints: ${input.formHints}` : "",
    ``,
    `Form structure found on the page:`,
    `Inputs:`,
    ...inputLines,
    `Buttons:`,
    ...buttonLines,
    `Checkboxes:`,
    ...checkboxLines,
    input.formStructure.multiStep ? `Note: This appears to be a multi-step form.` : "",
    ``,
    `Template variables available: {{first_name}}, {{last_name}}, {{email}}, {{address}}, {{city}}, {{state}}, {{zip}}, {{country}}, {{phone}}, {{date_of_birth}}`,
    ``,
    `Use {{email}} for email fields, {{first_name}}/{{last_name}} for name fields, etc.`,
    `Use comma-separated fallback selectors for robustness (e.g., 'input[name="email"], input[type="email"]').`,
    `Always end with a screenshot step labeled "success".`,
    `Always start with a goto step to the opt-out URL.`,
    `Add wait steps (2000ms) after navigation and before screenshots.`,
    ``,
    `Reference example:`,
    REFERENCE_PLAYBOOK,
    ``,
    `Generate ONLY the YAML. No explanation, no markdown fences.`,
  ].filter(Boolean).join("\n");
}

export function parseGeneratedPlaybook(yamlStr: string): Playbook | null {
  try {
    // Strip markdown fences if the LLM included them
    const cleaned = yamlStr.replace(/^```ya?ml\n?/m, "").replace(/\n?```\s*$/m, "").trim();
    const parsed = yaml.load(cleaned);
    const result = PlaybookSchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    logger.warn({ errors: result.error.issues }, "Generated playbook failed Zod validation");
    return null;
  } catch (err) {
    logger.warn({ err }, "Failed to parse generated playbook YAML");
    return null;
  }
}

export class PlaybookGenerator {
  constructor(
    private readonly browser: { page: any },
    private readonly profile: Profile,
    private readonly playbookDir: string,
    private readonly captchaHooks?: CaptchaHooks,
  ) {}

  async generate(broker: Broker): Promise<GenerateResult> {
    if (!broker.opt_out_url) {
      return { playbook: null, verified: false, error: "Broker has no opt_out_url" };
    }

    logger.info({ brokerId: broker.id }, "Generating playbook");

    // 1. Navigate to opt-out page (load saved cookies first)
    try {
      const domain = new URL(broker.opt_out_url).hostname;
      await loadProfileCookies(this.browser.page, domain);
    } catch {
      // Cookie loading failed — continue
    }

    try {
      await this.browser.page.goto(broker.opt_out_url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    } catch (err) {
      return { playbook: null, verified: false, error: `Navigation failed: ${err instanceof Error ? err.message : err}` };
    }

    // 2. Check for Cloudflare or other blocks (wait for transient challenges to auto-resolve)
    try {
      const blockResult = await waitForChallenge(this.browser.page);
      if (blockResult.blocked) {
        return { playbook: null, verified: false, error: `Page blocked: ${blockResult.reason}` };
      }
    } catch {
      // Block detection failed — continue
    }

    // 3. Extract form structure
    const formStructure = await this.extractFormStructure();
    if (!formStructure || (formStructure.inputs.length === 0 && formStructure.buttons.length === 0)) {
      return { playbook: null, verified: false, error: "No form structure found on page" };
    }

    // 4. Generate playbook via LLM
    const prompt = buildGeneratorPrompt({
      brokerId: broker.id,
      brokerName: broker.name,
      domain: broker.domain,
      optOutUrl: broker.opt_out_url,
      formHints: (broker as any).form_hints,
      formStructure,
    });

    const PlaybookYamlSchema = z.object({
      extraction: z.string().describe("The complete playbook YAML content"),
    });

    let playbook: Playbook | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await this.browser.page.extract({
        instruction: attempt === 0
          ? prompt
          : `The previous YAML was invalid. ${prompt}\n\nPlease fix the YAML and return only valid YAML.`,
        schema: PlaybookYamlSchema,
      });

      const extraction = (result as { extraction: string })?.extraction;
      const yamlContent = typeof extraction === "string" ? extraction : JSON.stringify(result);
      playbook = parseGeneratedPlaybook(yamlContent);
      if (playbook) break;
    }

    if (!playbook) {
      return { playbook: null, verified: false, error: "LLM failed to generate valid playbook YAML" };
    }

    // 5. Auto-test (dry run — execute all steps except the last click/submit)
    const verified = await this.autoTest(playbook);

    // 6. Save cookies after successful generation
    try {
      const domain = new URL(broker.opt_out_url).hostname;
      await saveProfileCookies(this.browser.page, domain);
    } catch {
      // Cookie save failed — not critical
    }

    // 7. Save
    const filePath = join(this.playbookDir, `${broker.id}.yaml`);
    writeFileSync(filePath, yaml.dump(playbook, { lineWidth: 140 }));
    logger.info({ brokerId: broker.id, verified, path: filePath }, "Playbook generated and saved");

    return { playbook, verified };
  }

  private async extractFormStructure(): Promise<FormStructure | null> {
    const FormFieldSchema = z.object({
      selector: z.string(),
      type: z.string().optional().default("text"),
      label: z.string().optional(),
      placeholder: z.string().optional(),
      name: z.string().optional(),
      text: z.string().optional(),
    });

    const FormStructureSchema = z.object({
      inputs: z.array(FormFieldSchema).describe("Form input fields with CSS selectors"),
      buttons: z.array(FormFieldSchema).describe("Submit/action buttons with CSS selectors"),
      checkboxes: z.array(FormFieldSchema).describe("Checkbox fields with CSS selectors"),
      selects: z.array(FormFieldSchema).describe("Select/dropdown fields with CSS selectors"),
      multiStep: z.boolean().describe("True if the form spans multiple pages or steps"),
    });

    try {
      const result = await this.browser.page.extract({
        instruction:
          "Analyze the forms on this page. Find all input fields, buttons, checkboxes, and select elements. " +
          "Use CSS selectors that are robust (prefer attribute selectors like input[name=\"email\"] over class names). " +
          "For each element, provide its CSS selector, type, label text, placeholder text, and name attribute.",
        schema: FormStructureSchema,
      });

      if (typeof result === "object" && result !== null) {
        const parsed = result as z.infer<typeof FormStructureSchema>;
        return {
          inputs: parsed.inputs.map((f) => ({ selector: f.selector, type: f.type ?? "text", label: f.label, placeholder: f.placeholder, name: f.name })),
          buttons: parsed.buttons.map((f) => ({ selector: f.selector, type: "button", text: f.text ?? f.label })),
          checkboxes: parsed.checkboxes.map((f) => ({ selector: f.selector, type: "checkbox", label: f.label })),
          selects: parsed.selects?.map((f) => ({ selector: f.selector, type: "select", label: f.label })),
          multiStep: parsed.multiStep === true,
        };
      }
      return null;
    } catch (err) {
      logger.warn({ err }, "Form structure extraction failed");
      return null;
    }
  }

  private async autoTest(playbook: Playbook): Promise<boolean> {
    try {
      // Create a test copy that removes the last click step (likely the submit button)
      const testPlaybook = structuredClone(playbook);
      const lastPhase = testPlaybook.phases[testPlaybook.phases.length - 1];
      const steps = lastPhase.steps;

      // Find the last click step and remove it + everything after (except screenshot)
      let lastClickIdx = -1;
      for (let i = steps.length - 1; i >= 0; i--) {
        if (steps[i].action === "click") {
          lastClickIdx = i;
          break;
        }
      }
      if (lastClickIdx > 0) {
        lastPhase.steps = steps.slice(0, lastClickIdx);
      }

      const executor = new PlaybookExecutor(
        this.browser.page,
        this.profile,
        undefined,
        this.captchaHooks,
      );
      const result = await executor.execute(testPlaybook);
      return result.success;
    } catch {
      return false;
    }
  }
}
