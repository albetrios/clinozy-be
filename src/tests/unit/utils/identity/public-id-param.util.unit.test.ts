import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/shared/errors/index.js';
import { validatePublicIdParam } from '@/shared/utils/identity/public-id-param.util.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';

describe('validatePublicIdParam', () => {
  it('returns the value when public id format is valid', () => {
    const publicId = generatePublicId('user');
    expect(validatePublicIdParam({ value: publicId, fieldName: 'id' })).toBe(publicId);
  });

  it('throws ValidationError when format is invalid', () => {
    expect(() => validatePublicIdParam({ value: 'not-a-public-id', fieldName: 'id' })).toThrow(
      ValidationError,
    );
  });
});
