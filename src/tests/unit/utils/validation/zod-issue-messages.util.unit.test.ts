import { join } from 'node:path';
import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  pickLocalizedMessage,
  renderZodIssueMessages,
} from '@/shared/utils/validation/zod-issue-messages.util.js';

/**
 * Validation messages follow the caller's language: Zod's own messages come from Zod's catalog for
 * each language, a schema's own message is a translation key, and plain text a schema wrote stays.
 */
function firstIssue(schema: z.ZodType, input: unknown, reportInput = true) {
  const result = schema.safeParse(input, { reportInput });
  if (result.success) throw new Error('expected a failing parse');
  return result.error.issues[0]!;
}

describe('renderZodIssueMessages', () => {
  beforeAll(async () => {
    await i18next.use(Backend).init({
      lng: 'en',
      fallbackLng: 'en',
      ns: ['errors'],
      defaultNS: 'errors',
      preload: ['en', 'es'],
      backend: { loadPath: join(process.cwd(), 'src/shared/locales/{{lng}}/{{ns}}.json') },
    });
  });

  it("renders Zod's own message in every language", () => {
    const messages = renderZodIssueMessages(
      firstIssue(z.object({ age: z.number() }), { age: '7' }),
    );
    expect(messages.en).toBe('Invalid input: expected number, received string');
    expect(messages.es).toBe('Entrada inválida: se esperaba número, recibido texto');
  });

  it("translates a schema's own message key", () => {
    const schema = z.object({
      url: z.string().refine((url) => url.startsWith('https://'), {
        message: 'errors:validation.webhookUrlMustUseHttps',
      }),
    });
    const messages = renderZodIssueMessages(firstIssue(schema, { url: 'http://x' }));
    expect(messages).toEqual({
      en: 'Webhook URL must use HTTPS',
      es: 'La URL del webhook debe usar HTTPS',
    });
  });

  it("fills a message key's placeholders from the custom issue's params.messageParams", () => {
    const schema = z.object({
      method: z.string().superRefine((method, context) => {
        context.addIssue({
          code: 'custom',
          message: 'errors:validation.requiredForSettleMethod',
          params: { messageParams: { method } },
        });
      }),
    });
    expect(renderZodIssueMessages(firstIssue(schema, { method: 'money' }))).toEqual({
      en: 'Required for money',
      es: 'Obligatorio para money',
    });
  });

  it('keeps plain text a schema wrote in every language', () => {
    const schema = z.object({ name: z.string().min(3, { message: 'Too short for us' }) });
    expect(renderZodIssueMessages(firstIssue(schema, { name: 'x' }))).toEqual({
      en: 'Too short for us',
      es: 'Too short for us',
    });
  });

  it('keeps English for a type error whose input was not reported (Zod would say "undefined")', () => {
    const issue = firstIssue(z.object({ age: z.number() }), { age: '7' }, false);
    expect(renderZodIssueMessages(issue).es).toBe(issue.message);
  });
});

describe('pickLocalizedMessage', () => {
  it('picks the language, English for an unknown one or none', () => {
    const messages = { en: 'Hello', es: 'Hola' };
    expect(pickLocalizedMessage({ messages, language: 'es' })).toBe('Hola');
    expect(pickLocalizedMessage({ messages, language: 'fr' })).toBe('Hello');
    expect(pickLocalizedMessage({ messages, language: undefined })).toBe('Hello');
  });
});
