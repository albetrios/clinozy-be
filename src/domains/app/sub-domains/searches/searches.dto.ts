import { z } from 'zod';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';

/** Query of `GET /app/searches` — at least 3 characters: a name, phone digits or a number. */
export const listSearchesQueryDto = z
  .object({
    q: trimmedStringMinMax(1, 80).refine((value) => value.length >= 3 || /^#?\d+$/.test(value), {
      message: 'At least 3 characters, or a number such as 42 or #42',
    }),
  })
  .strict();

/** Parsed {@link listSearchesQueryDto}. */
export type ListSearchesQueryInput = z.infer<typeof listSearchesQueryDto>;
