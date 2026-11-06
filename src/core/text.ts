import { decode } from 'he';
import { convert } from 'html-to-text';

/** Convert an HTML fragment to readable plain text. */
export function htmlToPlain(html: string | null | undefined): string {
  if (!html) return '';
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: 'a', options: { ignoreHref: true } },
      { selector: 'img', format: 'skip' },
      { selector: 'h1', options: { uppercase: false } },
      { selector: 'h2', options: { uppercase: false } },
      { selector: 'h3', options: { uppercase: false } },
      { selector: 'h4', options: { uppercase: false } },
      { selector: 'h5', options: { uppercase: false } },
      { selector: 'h6', options: { uppercase: false } },
      { selector: 'table', format: 'dataTable' },
    ],
  })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Greenhouse returns `content` with its HTML entity-escaped (`&lt;p&gt;`), so decode first. */
export function escapedHtmlToPlain(escaped: string | null | undefined): string {
  if (!escaped) return '';
  return htmlToPlain(decode(escaped));
}

export function joinNonEmpty(parts: Array<string | null | undefined>, sep = '\n\n'): string {
  return parts
    .map((p) => p?.trim())
    .filter((p): p is string => !!p)
    .join(sep);
}
