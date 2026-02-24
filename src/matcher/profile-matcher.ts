import type { Profile } from "../types/config.js";
import { logger } from "../util/logger.js";

export interface MatchField {
  field: string;
  matched: boolean;
  score: number;
}

export interface MatchResult {
  totalScore: number;
  fields: MatchField[];
  recommendation: "auto_remove" | "manual_review" | "skip";
}

const SCORE_WEIGHTS = {
  name: 30,
  city: 20,
  state: 10,
  age: 20,
  address: 30,
  phone: 25,
  middle_name: 15,
} as const;

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-10);
}

function normalizeString(s: string): string {
  return s.toLowerCase().trim();
}

function calculateAge(dob: string): number | null {
  try {
    const birthDate = new Date(dob);
    if (isNaN(birthDate.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  } catch {
    return null;
  }
}

export function scoreProfileMatch(
  profile: Profile,
  brokerData: Record<string, string>,
  thresholds: { auto: number; manual: number } = { auto: 60, manual: 40 }
): MatchResult {
  const fields: MatchField[] = [];
  let totalScore = 0;

  // Name match
  const brokerName = brokerData["name"] ?? brokerData["full_name"] ?? "";
  if (brokerName) {
    const fullName = `${profile.first_name} ${profile.last_name}`;
    const matched =
      normalizeString(brokerName).includes(normalizeString(profile.first_name)) &&
      normalizeString(brokerName).includes(normalizeString(profile.last_name));
    const score = matched ? SCORE_WEIGHTS.name : 0;
    totalScore += score;
    fields.push({ field: "name", matched, score });
  }

  // City match
  const brokerCity = brokerData["city"] ?? "";
  if (brokerCity && profile.city) {
    const matched = normalizeString(brokerCity) === normalizeString(profile.city);
    const score = matched ? SCORE_WEIGHTS.city : 0;
    totalScore += score;
    fields.push({ field: "city", matched, score });
  }

  // State match
  const brokerState = brokerData["state"] ?? "";
  if (brokerState && profile.state) {
    const matched = normalizeString(brokerState) === normalizeString(profile.state);
    const score = matched ? SCORE_WEIGHTS.state : 0;
    totalScore += score;
    fields.push({ field: "state", matched, score });
  }

  // Age match (within 2 years)
  const brokerAge = brokerData["age"] ?? "";
  if (brokerAge && profile.date_of_birth) {
    const profileAge = calculateAge(profile.date_of_birth);
    const parsedBrokerAge = parseInt(brokerAge, 10);
    if (profileAge !== null && !isNaN(parsedBrokerAge)) {
      const matched = Math.abs(profileAge - parsedBrokerAge) <= 2;
      const score = matched ? SCORE_WEIGHTS.age : 0;
      totalScore += score;
      fields.push({ field: "age", matched, score });
    }
  }

  // Address match
  const brokerAddress = brokerData["address"] ?? "";
  if (brokerAddress && profile.address) {
    const matched = normalizeString(brokerAddress).includes(
      normalizeString(profile.address).split(" ").slice(0, 2).join(" ")
    );
    const score = matched ? SCORE_WEIGHTS.address : 0;
    totalScore += score;
    fields.push({ field: "address", matched, score });
  }

  // Phone match
  const brokerPhone = brokerData["phone"] ?? "";
  if (brokerPhone && profile.phone) {
    const matched = normalizePhone(brokerPhone) === normalizePhone(profile.phone);
    const score = matched ? SCORE_WEIGHTS.phone : 0;
    totalScore += score;
    fields.push({ field: "phone", matched, score });
  }

  // Middle name match
  const brokerMiddle = brokerData["middle_name"] ?? "";
  if (brokerMiddle && profile.aliases.length > 0) {
    const matched = profile.aliases.some(
      (alias) => normalizeString(brokerMiddle) === normalizeString(alias)
    );
    const score = matched ? SCORE_WEIGHTS.middle_name : 0;
    totalScore += score;
    fields.push({ field: "middle_name", matched, score });
  }

  const recommendation =
    totalScore >= thresholds.auto
      ? "auto_remove"
      : totalScore >= thresholds.manual
        ? "manual_review"
        : "skip";

  logger.debug(
    { totalScore, recommendation, fieldCount: fields.length },
    "Profile match scored"
  );

  return { totalScore, fields, recommendation };
}
