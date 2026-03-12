import { homedir } from "node:os";

interface RedactOptions {
  names?: string[];
}

export function redactPii(text: string, options: RedactOptions = {}): string {
  let result = text;

  // Replace home directory with ~
  const home = homedir();
  result = result.replaceAll(home, "~");

  // Redact email addresses: user@domain.tld → u***@d***.tld
  result = result.replace(
    /\b([a-zA-Z0-9._%+\-]+)@([a-zA-Z0-9.\-]+)\.([a-zA-Z]{2,})\b/g,
    (_, local: string, domain: string, tld: string) => {
      const maskedLocal = local[0] + "*".repeat(Math.max(local.length - 1, 2));
      const maskedDomain = domain[0] + "*".repeat(Math.max(domain.length - 1, 2));
      return `${maskedLocal}@${maskedDomain}.${tld}`;
    }
  );

  // Redact phone numbers
  result = result.replace(
    /\b(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g,
    "[REDACTED]"
  );

  // Redact known names (each word masked to FirstLetter***)
  if (options.names) {
    for (const name of options.names) {
      if (!name) continue;
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const parts = name.split(/\s+/);
      const replacement = parts.map((p) => p[0] + "*".repeat(Math.max(p.length - 1, 2))).join(" ");
      result = result.replace(new RegExp(escaped, "gi"), replacement);
    }
  }

  return result;
}
