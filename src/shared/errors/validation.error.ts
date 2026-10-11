import { AppError } from './app.error.js';

/** One field-level entry in a {@link ValidationError}'s `errors` array (Paddle-style validation output). */
export interface ValidationErrorItem {
  field: string;
  /** Fallback when messageKey is absent or request.t is unavailable. */
  message?: string;
  /** When set, error handler uses request.t(messageKey, messageParams) for message. */
  messageKey?: string;
  messageParams?: Record<string, string | number>;
  /** The message already rendered per response language (a Zod issue); the handler picks one. */
  localizedMessages?: Readonly<Record<string, string>>;
}

/**
 * 400 Bad Request — request body or params failed schema/business validation.
 * Carries a Paddle-style `errors[]` list with per-field translation keys so
 * the error handler can localize each entry.
 */
export class ValidationError extends AppError {
  /** Paddle-style list for error response */
  readonly errors?: ValidationErrorItem[];

  constructor(
    messageKey: string,
    messageParams?: Record<string, string | number>,
    fallbackMessage?: string,
    errors?: ValidationErrorItem[],
  ) {
    super('VALIDATION_ERROR', 400, messageKey, messageParams, fallbackMessage ?? messageKey);
    if (errors !== undefined) {
      this.errors = errors;
    }
  }
}
