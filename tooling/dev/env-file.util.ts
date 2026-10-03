/**
 * Line-level editing of dotenv files for the local bootstrap (`pnpm setup:local`).
 */

/**
 * Sets `KEY=<value>` in env-file `content`: replaces the key's existing line, or appends one.
 *
 * @remarks
 * `value` is written as given — pass it through {@link formatEnvValue} first unless it is already
 * in dotenv syntax (a pre-quoted PEM, for example). The replacement is a function, so a `$` in a
 * value is never read as a `String.replace` pattern (`$&`, `$1`).
 */
export function upsertEnvAssignment(content: string, key: string, value: string): string {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escapedKey}=.*$`, 'm');
  const line = `${key}=${value}`;
  if (pattern.test(content)) return content.replace(pattern, () => line);
  return content.endsWith('\n') ? `${content}${line}\n` : `${content}\n${line}\n`;
}

/**
 * A logical value in dotenv syntax that `dotenv.parse` reads back unchanged: bare when it is a plain
 * token; single-quoted (dotenv takes it literally) when it has no `'` or newline; double-quoted with
 * `\n` escapes (the only escape dotenv decodes) when it has no `"`; backtick-quoted otherwise.
 */
export function formatEnvValue(value: string): string {
  if (/^[A-Za-z0-9_./:@+,=-]*$/.test(value)) return value;
  if (!(value.includes("'") || value.includes('\n'))) return `'${value}'`;
  if (!value.includes('"')) return `"${value.replace(/\n/g, '\\n')}"`;
  return `\`${value}\``;
}
