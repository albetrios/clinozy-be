import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig, RESERVED_EMAIL_DOMAIN } from '@tooling/setup/common/config.js';

const CONTACT_FILES = ['SECURITY.md', 'CODE_OF_CONDUCT.md'];

/** Every `local@domain` token in a Markdown file, without the punctuation that ends a sentence. */
function addressesIn(text: string): string[] {
  return text
    .split(/[\s<>*()]/)
    .filter((token) => token.includes('@'))
    .map((token) => {
      let address = token;
      while (/[.,;:]$/.test(address)) address = address.slice(0, -1);
      return address;
    });
}

/**
 * A researcher who cannot use GitHub private vulnerability reporting writes to the address
 * SECURITY.md gives (SEC-02). An address on a name reserved for documentation (RFC 2606 /
 * RFC 6761) reaches nobody, so a report sent there is lost. The address is
 * `project.securityContact` in tooling/setup/setup.config.json; the files are generated from it
 * (`pnpm tool:generate-project-identity`). clinozy-fe pins the same contract in
 * tests/ci/security-contact.policy.test.ts.
 */
describe('security contact', () => {
  const { securityContact } = loadConfig().project;

  it('the manifest names a mailbox, not a reserved documentation domain', () => {
    expect(securityContact).not.toMatch(RESERVED_EMAIL_DOMAIN);
  });

  it.each(CONTACT_FILES)('%s gives the manifest contact and no reserved-domain address', (file) => {
    const text = readFileSync(join(process.cwd(), file), 'utf8');
    expect(text).toContain(securityContact);
    const reserved = addressesIn(text).filter((address) => RESERVED_EMAIL_DOMAIN.test(address));
    expect(reserved).toEqual([]);
  });
});
