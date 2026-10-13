import { marked, type Token, type Tokens } from 'marked';
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { Hl } from './highlight';
import { Icon } from './icons';

/**
 * Markdown for agent replies. `marked` only tokenises; every element here is made by React, so
 * raw HTML in a reply is never parsed into elements: it shows as the text it is, and scripts,
 * event handlers and styles cannot run. Links open in a new tab, and only web and mail links
 * become links. Images are not loaded; they show as a link to the image.
 */

const SAFE_HREF = /^(https?:\/\/|mailto:)/i;

function safeHref(href: string | null | undefined): string | null {
  const h = (href ?? '').trim();
  return SAFE_HREF.test(h) ? h : null;
}

/** Copies text, with a fallback for browsers without the async clipboard. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const t = document.createElement('textarea');
    t.value = text;
    t.setAttribute('readonly', '');
    t.style.position = 'fixed';
    t.style.opacity = '0';
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand?.('copy') ?? false;
    t.remove();
    return ok;
  } catch {
    return false;
  }
}

/** A copy button that says "Copied" for a moment after it worked. */
export function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const copy = async () => {
    const ok = await copyText(text);
    setState(ok ? 'copied' : 'failed');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 1600);
  };
  return (
    <button type="button" className={`copy-btn${className ? ` ${className}` : ''}`} aria-label={label} data-tip={label} onClick={() => void copy()}>
      <Icon name={state === 'copied' ? 'check' : 'copy'} size={13} />
      <span aria-live="polite">{state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy'}</span>
    </button>
  );
}

function CodeBlock({ lang, text }: { lang: string; text: string }) {
  const name = lang.trim().split(/\s+/)[0] || 'text';
  return (
    <figure className="md-code" aria-label={`${name} code`}>
      <figcaption className="md-code-bar">
        <span className="md-code-lang">{name}</span>
        <CopyButton text={text} label="Copy code" />
      </figcaption>
      <pre>
        <code>
          <Hl text={text} />
        </code>
      </pre>
    </figure>
  );
}

function inline(tokens: Token[] | undefined, key = 'i'): ReactNode[] {
  return (tokens ?? []).map((t, i) => inlineToken(t, `${key}.${i}`));
}

function inlineToken(t: Token, key: string): ReactNode {
  switch (t.type) {
    case 'text': {
      const tt = t as Tokens.Text;
      return tt.tokens ? <span key={key}>{inline(tt.tokens, key)}</span> : <Hl key={key} text={tt.text} />;
    }
    case 'escape':
      return <Hl key={key} text={(t as Tokens.Escape).text} />;
    case 'strong':
      return <strong key={key}>{inline((t as Tokens.Strong).tokens, key)}</strong>;
    case 'em':
      return <em key={key}>{inline((t as Tokens.Em).tokens, key)}</em>;
    case 'del':
      return <del key={key}>{inline((t as Tokens.Del).tokens, key)}</del>;
    case 'codespan':
      return (
        <code key={key} className="md-inline-code">
          <Hl text={(t as Tokens.Codespan).text} />
        </code>
      );
    case 'br':
      return <br key={key} />;
    case 'link': {
      const l = t as Tokens.Link;
      const href = safeHref(l.href);
      const body = inline(l.tokens, key);
      if (!href) return <span key={key}>{body}</span>;
      return (
        <a key={key} href={href} target="_blank" rel="noopener noreferrer" title={l.title ?? href} data-raw-evidence-title>
          {body}
        </a>
      );
    }
    case 'image': {
      const im = t as Tokens.Image;
      const href = safeHref(im.href);
      const label = `image: ${im.text || 'untitled'}`;
      return href ? (
        <a key={key} href={href} target="_blank" rel="noopener noreferrer">
          {label}
        </a>
      ) : (
        <span key={key}>{label}</span>
      );
    }
    case 'checkbox':
      return <span key={key}>{(t as Tokens.Checkbox).checked ? '☑ ' : '☐ '}</span>;
    case 'html':
    default:
      // Raw HTML and anything unknown: shown as written.
      return <Hl key={key} text={(t as { raw: string }).raw} />;
  }
}

function blocks(tokens: Token[], key = 'b'): ReactNode[] {
  return tokens.map((t, i) => blockToken(t, `${key}.${i}`));
}

function listItem(item: Tokens.ListItem, key: string): ReactNode {
  const box = item.task ? <span className="md-task">{item.checked ? '☑ ' : '☐ '}</span> : null;
  // marked may already include a checkbox token; skip it so the box shows once.
  const toks = item.task ? item.tokens.filter((t) => t.type !== 'checkbox') : item.tokens;
  const content = toks.map((t, i) => (t.type === 'text' ? <span key={i}>{inline((t as Tokens.Text).tokens ?? [t], `${key}.${i}`)}</span> : blockToken(t, `${key}.${i}`)));
  return (
    <li key={key} className={item.task ? 'md-task-item' : undefined}>
      {box}
      {content}
    </li>
  );
}

function blockToken(t: Token, key: string): ReactNode {
  switch (t.type) {
    case 'space':
    case 'def':
      return null;
    case 'heading': {
      const h = t as Tokens.Heading;
      return (
        <div key={key} role="heading" aria-level={Math.min(6, h.depth + 2)} className={`md-h md-h${h.depth}`}>
          {inline(h.tokens, key)}
        </div>
      );
    }
    case 'paragraph':
      return <p key={key}>{inline((t as Tokens.Paragraph).tokens, key)}</p>;
    case 'text': {
      const tt = t as Tokens.Text;
      return <p key={key}>{tt.tokens ? inline(tt.tokens, key) : <Hl text={tt.text} />}</p>;
    }
    case 'code': {
      const c = t as Tokens.Code;
      return <CodeBlock key={key} lang={c.lang ?? ''} text={c.text} />;
    }
    case 'blockquote':
      return <blockquote key={key}>{blocks((t as Tokens.Blockquote).tokens, key)}</blockquote>;
    case 'hr':
      return <hr key={key} />;
    case 'list': {
      const l = t as Tokens.List;
      const items = l.items.map((it, i) => listItem(it, `${key}.${i}`));
      return l.ordered ? (
        <ol key={key} start={typeof l.start === 'number' && l.start !== 1 ? l.start : undefined}>
          {items}
        </ol>
      ) : (
        <ul key={key}>{items}</ul>
      );
    }
    case 'table': {
      const tb = t as Tokens.Table;
      const align = (a: string | null) => (a ? { textAlign: a as 'left' | 'right' | 'center' } : undefined);
      return (
        <div key={key} className="md-table">
          <table>
            <thead>
              <tr>
                {tb.header.map((c, i) => (
                  <th key={i} scope="col" style={align(tb.align[i])}>
                    {inline(c.tokens, `${key}.h${i}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tb.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((c, i) => (
                    <td key={i} style={align(tb.align[i])}>
                      {inline(c.tokens, `${key}.${r}.${i}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case 'html':
    default:
      return (
        <p key={key} className="md-raw">
          <Hl text={(t as { raw: string }).raw.replace(/\n+$/, '')} />
        </p>
      );
  }
}

/** Agent Markdown as React elements. Memoised: replies do not change once written. */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  let tokens: Token[];
  try {
    tokens = marked.lexer(text, { gfm: true });
  } catch {
    return <p className="md-raw">{text}</p>;
  }
  return <div className="md">{blocks(tokens)}</div>;
});
