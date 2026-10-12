import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  ReplaceContactMembersDto,
  type ReplaceContactMembersInput,
} from './contact-members.dto.js';

/** Parses a contact members body; throws `ValidationError` on a bad value. */
export function validateReplaceContactMembers(data: unknown): ReplaceContactMembersInput {
  return parseWithSchema({ schema: ReplaceContactMembersDto, data });
}
