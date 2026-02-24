import pino from "pino";

const PII_PATHS = [
  "email",
  "phone",
  "address",
  "first_name",
  "last_name",
  "full_name",
  "date_of_birth",
  "dob",
  "zip",
  "ssn",
  "profile.email",
  "profile.phone",
  "profile.address",
  "profile.first_name",
  "profile.last_name",
  "config.email.auth.pass",
  "config.inbox.auth.pass",
  "auth.pass",
  "auth.user",
  "pass",
];

export function createLogger(options: {
  level?: string;
  file?: string;
  redactPii?: boolean;
}): pino.Logger {
  const { level = "info", file, redactPii = true } = options;

  const redact = redactPii
    ? { paths: PII_PATHS, censor: "[REDACTED]" }
    : undefined;

  const targets: pino.TransportTargetOptions[] = [
    {
      target: "pino-pretty",
      options: { colorize: true },
      level,
    },
  ];

  if (file) {
    targets.push({
      target: "pino/file",
      options: { destination: file, mkdir: true },
      level,
    });
  }

  return pino({
    level,
    redact,
    transport: { targets },
  });
}

// Default logger instance (reconfigured after config loads)
export let logger = createLogger({ level: "info" });

export function reconfigureLogger(options: {
  level?: string;
  file?: string;
  redactPii?: boolean;
}): void {
  logger = createLogger(options);
}
