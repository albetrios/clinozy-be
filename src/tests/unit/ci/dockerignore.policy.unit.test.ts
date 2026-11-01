import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const entries = readFileSync('.dockerignore', 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line !== '' && !line.startsWith('#'));

/**
 * The local files that hold credentials, each gitignored, and why it must stay out of the build
 * context too: the Dockerfiles' build stage runs `COPY . .`, so a path `.dockerignore` misses lands
 * in the image layers (H-9).
 */
const LOCAL_CREDENTIALS = new Map([
  ['.env.*', 'the per-environment env files and the machine-local one'],
  ['.setup/', 'the setup tooling credentials and provisioned state'],
  ['.setup-credentials', 'a stray setup credentials file at the root'],
  ['.setup-state.*', 'the setup state file, its backup, lock and audit log'],
  ['tooling/setup.secrets.json', 'legacy setup secrets'],
  ['.backups/', 'local env backups'],
  ['.mcp.json', 'the MCP config, with real API keys once filled'],
  ['agent-os/mcp/mcp.json', 'the file .mcp.json links to'],
]);

describe('.dockerignore keeps local credentials out of the image (H-9)', () => {
  it.each([...LOCAL_CREDENTIALS])('leaves out %s (%s)', (entry) => {
    expect(entries).toContain(entry);
  });

  it('every one is gitignored too, so nothing else ships it', () => {
    const gitignore = readFileSync('.gitignore', 'utf8');
    for (const entry of [
      '.setup/',
      'agent-os/mcp/mcp.json',
      '.backups/',
      'tooling/setup.secrets.json',
    ]) {
      expect(gitignore, entry).toContain(entry);
    }
  });

  it('keeps .env.example in the context, the one env file the build may read', () => {
    expect(entries).toContain('!.env.example');
  });
});
