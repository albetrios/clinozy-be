/** The printable ASCII range a quoted `filename` may carry (space through tilde). */
const PRINTABLE_ASCII = { first: 0x20, last: 0x7e } as const;

/** One character of the ASCII fallback name: itself when safe in quotes, else an underscore. */
function quotedFilenameCharacter(character: string): string {
  const code = character.codePointAt(0) ?? 0;
  const printable = code >= PRINTABLE_ASCII.first && code <= PRINTABLE_ASCII.last;
  return printable && character !== '"' && character !== '\\' ? character : '_';
}

/**
 * An `inline` `Content-Disposition` naming the file (RFC 6266): a browser shows the object and,
 * on save, uses this name.
 *
 * @remarks
 * - **Algorithm:** the plain `filename` parameter carries an ASCII fallback (every quote,
 *   backslash, control or non-ASCII character an underscore); `filename*` carries the exact name,
 *   UTF-8 and percent-encoded (RFC 8187), which every current browser prefers.
 * - **Notes:** a name can never inject into the header — the fallback holds no quote, backslash
 *   or control character, and the encoded form holds none at all.
 */
export function inlineContentDisposition(fileName: string): string {
  const fallback = Array.from(fileName, quotedFilenameCharacter).join('');
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
