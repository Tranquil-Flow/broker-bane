export class BrokerBaneError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "BrokerBaneError";
  }
}

export class ConfigError extends BrokerBaneError {
  constructor(message: string, cause?: unknown) {
    super(message, "CONFIG_ERROR", cause);
    this.name = "ConfigError";
  }
}

export class DatabaseError extends BrokerBaneError {
  constructor(message: string, cause?: unknown) {
    super(message, "DATABASE_ERROR", cause);
    this.name = "DatabaseError";
  }
}

export class EmailError extends BrokerBaneError {
  constructor(message: string, cause?: unknown) {
    super(message, "EMAIL_ERROR", cause);
    this.name = "EmailError";
  }
}

export class BrowserError extends BrokerBaneError {
  constructor(message: string, cause?: unknown) {
    super(message, "BROWSER_ERROR", cause);
    this.name = "BrowserError";
  }
}

export class CaptchaError extends BrokerBaneError {
  constructor(message: string, cause?: unknown) {
    super(message, "CAPTCHA_ERROR", cause);
    this.name = "CaptchaError";
  }
}

export class ValidationError extends BrokerBaneError {
  constructor(message: string, cause?: unknown) {
    super(message, "VALIDATION_ERROR", cause);
    this.name = "ValidationError";
  }
}

export class StateTransitionError extends BrokerBaneError {
  constructor(from: string, to: string) {
    super(`Invalid state transition: ${from} -> ${to}`, "STATE_TRANSITION_ERROR");
    this.name = "StateTransitionError";
  }
}

export class CircuitBreakerOpenError extends BrokerBaneError {
  constructor(
    public readonly identifier: string,
    public readonly cooldownUntil: Date,
    customMessage?: string
  ) {
    super(
      customMessage ??
        `Circuit breaker open for ${identifier} until ${cooldownUntil.toISOString()}`,
      "CIRCUIT_BREAKER_OPEN"
    );
    this.name = "CircuitBreakerOpenError";
  }
}

export class LinkValidationError extends BrokerBaneError {
  constructor(url: string, reason: string) {
    super(`Unsafe link rejected: ${url} - ${reason}`, "LINK_VALIDATION_ERROR");
    this.name = "LinkValidationError";
  }
}
