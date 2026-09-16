import { Fragment, useMemo } from 'react';

/**
 * Minimal, dependency-free Markdown renderer for AI replies: headings (###),
 * paragraphs, bullet/numbered lists, bold, italics, inline code, links.
 * Everything is rendered as React nodes — no HTML injection.
 */
function inline(text, key) {
  const parts = [];
  const rx = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = rx.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith('**')) parts.push(<strong key={`${key}-${i++}`}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith('`')) parts.push(<code key={`${key}-${i++}`}>{token.slice(1, -1)}</code>);
    else if (token.startsWith('[')) {
      const label = token.slice(1, token.indexOf(']'));
      parts.push(<a key={`${key}-${i++}`} href={m[2]} target="_blank" rel="noopener noreferrer">{label}</a>);
    } else parts.push(<em key={`${key}-${i++}`}>{token.slice(1, -1)}</em>);
    last = m.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function parse(source) {
  const lines = source.replace(/\r/g, '').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push({ type: 'h', level: Math.max(3, heading[1].length), text: heading[2] });
      i++;
      continue;
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, ''));
        i++;
      }
      blocks.push({ type: ordered ? 'ol' : 'ul', items });
      continue;
    }
    if (line.startsWith('```')) {
      const code = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]);
      i++;
      blocks.push({ type: 'pre', text: code.join('\n') });
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*([-*•]|\d+[.)])\s|```)/.test(lines[i])) para.push(lines[i++]);
    blocks.push({ type: 'p', text: para.join(' ') });
  }
  return blocks;
}

export function Markdown({ children, className }) {
  const blocks = useMemo(() => parse(String(children ?? '')), [children]);
  return (
    <div className={className ?? 'md'}>
      {blocks.map((b, i) => {
        if (b.type === 'h') {
          const Tag = `h${b.level}`;
          return <Tag key={i}>{inline(b.text, i)}</Tag>;
        }
        if (b.type === 'ul' || b.type === 'ol') {
          const Tag = b.type;
          return <Tag key={i}>{b.items.map((item, j) => <li key={j}>{inline(item, `${i}-${j}`)}</li>)}</Tag>;
        }
        if (b.type === 'pre') return <pre key={i}><code>{b.text}</code></pre>;
        return <p key={i}>{inline(b.text, i)}</p>;
      })}
      <Fragment />
    </div>
  );
}
