import React from 'react';

/**
 * The smallest markdown Cerebus's model answers actually use: bold, and
 * paragraph/list breaks. Groq's replies come back as real markdown (`**word**`,
 * `- item` lines) and were rendered as a literal string with the asterisks
 * still in it — this is not a general-purpose renderer, just enough to stop
 * showing a reader the syntax instead of the formatting it was written for.
 */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts
    .filter((part) => part.length > 0)
    .map((part, i) => {
      const bold = /^\*\*([^*]+)\*\*$/.exec(part);
      return bold ? <strong key={`${keyPrefix}-${i}`}>{bold[1]}</strong> : <React.Fragment key={`${keyPrefix}-${i}`}>{part}</React.Fragment>;
    });
}

export function renderMarkdownLite(content: string): React.ReactNode {
  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = (key: string) => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={key} style={{ margin: '4px 0', paddingLeft: '18px' }}>
        {listItems.map((item, i) => (
          <li key={i}>{renderInline(item, `${key}-li-${i}`)}</li>
        ))}
      </ul>,
    );
    listItems = [];
  };

  lines.forEach((line, idx) => {
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      listItems.push(bullet[1] ?? '');
      return;
    }
    flushList(`list-${idx}`);
    if (line.trim().length === 0) {
      blocks.push(<div key={`gap-${idx}`} style={{ height: '6px' }} />);
    } else {
      blocks.push(<p key={`p-${idx}`} style={{ margin: 0 }}>{renderInline(line, `p-${idx}`)}</p>);
    }
  });
  flushList('list-end');

  return <>{blocks}</>;
}
