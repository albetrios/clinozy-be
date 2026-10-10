import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { safeParse } from 'zod/v4/core';
import { renderZodIssueMessages } from '@/shared/utils/validation/zod-issue-messages.util.js';

/**
 * The type provider's validator, with each failing issue also rendered in every response language
 * (`params.localizedMessages`) so `errors[].message` follows `Accept-Language`. Only a failing
 * request pays the second parse, which reports the input so Zod can name the received type.
 */
const localizedValidatorCompiler: typeof validatorCompiler = (routeSchema) => {
  const validate = validatorCompiler(routeSchema);
  return (data) => {
    const result = validate(data);
    if (typeof result !== 'object' || !('error' in result) || !Array.isArray(result.error)) {
      return result;
    }
    const detailed = safeParse(routeSchema.schema, data, { reportInput: true });
    if (detailed.success) return result;
    return {
      error: result.error.map((issue, index) => {
        const detailedIssue = detailed.error.issues[index];
        return detailedIssue === undefined
          ? issue
          : {
              ...issue,
              params: { ...issue.params, localizedMessages: renderZodIssueMessages(detailedIssue) },
            };
      }),
    };
  };
};

/**
 * Enables Zod schemas on route `schema` blocks (incremental adoption alongside JSON Schema).
 */
const zodTypeProviderMiddleware: FastifyPluginAsync = async (application) => {
  application.setValidatorCompiler(localizedValidatorCompiler);
  application.setSerializerCompiler(serializerCompiler);
};

export default fp(zodTypeProviderMiddleware, { name: 'zod-type-provider' });
