import { DOMParser as PmDomParser } from '@tiptap/pm/model';
import { getSchema, type Extensions } from '@tiptap/core';
import Bold from '@tiptap/extension-bold';
import Document from '@tiptap/extension-document';
import HardBreak from '@tiptap/extension-hard-break';
import Italic from '@tiptap/extension-italic';
import Link from '@tiptap/extension-link';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { CharacterCount, UndoRedo } from '@tiptap/extensions';
import { LIMITS } from '@shared/limits';
import { LINK_PATTERN } from '@shared/validate';
import { docToRich, type PmNode } from '@editor/document/richtext';
import type { RichParagraph } from '@shared/types';

/**
 * The only editor schema: paragraphs, line breaks, bold, italic and policy-checked links. Because
 * the same schema parses pasted HTML, nothing else (scripts, styles, attributes, other elements,
 * unsafe URLs) can enter the document.
 */
const SafeLink = Link.extend({
  addAttributes() {
    return {
      href: { default: null },
      newTab: {
        default: false,
        // Pasted `target` attributes are not trusted; the editor sets this deliberately.
        parseHTML: () => false,
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes.newTab === true ? { target: '_blank', rel: 'noopener noreferrer' } : {},
      },
    };
  },
});

export function richExtensions(): Extensions {
  return [
    Document,
    Paragraph,
    Text,
    HardBreak,
    Bold,
    Italic,
    SafeLink.configure({
      openOnClick: false,
      autolink: false,
      linkOnPaste: false,
      HTMLAttributes: {},
      isAllowedUri: (url: string) => LINK_PATTERN.test(url),
    }),
    UndoRedo,
    CharacterCount.configure({ limit: LIMITS.textLength }),
  ];
}

/** Converts pasted/arbitrary HTML into the model through the editor schema (same as a paste). */
export function htmlToRich(html: string): RichParagraph[] {
  const schema = getSchema(richExtensions());
  // An inert document: nothing in it loads, runs or reaches the live page while it is parsed.
  const inert = new window.DOMParser().parseFromString(html, 'text/html');
  const doc = PmDomParser.fromSchema(schema).parse(inert.body);
  return docToRich(doc.toJSON() as PmNode);
}
