import { getDomain } from "tldts";
import { isValidDomain, emailDomainMatchesWebsite } from "../util/domain.js";
import { ValidationError } from "../util/errors.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  if (!EMAIL_REGEX.test(email)) return false;
  const domain = email.split("@")[1];
  if (!domain) return false;
  return isValidDomain(domain);
}

export function validateBrokerEmail(
  brokerEmail: string,
  brokerDomain: string
): void {
  if (!isValidEmail(brokerEmail)) {
    throw new ValidationError(`Invalid broker email: ${brokerEmail}`);
  }

  if (!emailDomainMatchesWebsite(brokerEmail, brokerDomain)) {
    throw new ValidationError(
      `Broker email domain does not match website: ${brokerEmail} vs ${brokerDomain}`
    );
  }
}

export function validateSenderEmail(email: string): void {
  if (!isValidEmail(email)) {
    throw new ValidationError(`Invalid sender email: ${email}`);
  }
}

export function extractEmailDomain(email: string): string | null {
  const parts = email.split("@");
  if (parts.length !== 2) return null;
  return getDomain(parts[1]!);
}
