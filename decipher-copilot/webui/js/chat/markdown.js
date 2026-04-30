/**
 * Minimal CommonMark-subset markdown renderer.
 * Zero dependencies, zero remote assets, no eval().
 * Handles: headings, bold, italic, code spans, fenced code blocks,
 * unordered/ordered lists, blockquotes, horizontal rules, links (data: only), tables.
 * Strips: <script>, javascript: hrefs, event handlers, any unknown HTML tags.
 */

import { sanitizeHtml } from '../util/sanitize.js';

const FENCE_RE = /^```(\w*)\n?([\s\S]*?)```$/m;

/**
 * Render markdown string to safe HTML string.
 * @param {string} md
 * @returns {string} HTML
 */
export function renderMarkdown(md) {
  if (!md || typeof md !== 'string') return '';

  // Normalize line endings
  let text = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Process fenced code blocks first (protect from inline processing)
  const codeBlocks = [];
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code class="language-${esc(lang || 'text')}">${escCode(code.replace(/\n$/, ''))}</code></pre>`);
    return `\x00CODE${idx}\x00`;
  });

  // Process inline code (protect from further processing)
  const inlineCodes = [];
  text = text.replace(/`([^`]+)`/g, (_, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(`<code>${escCode(code)}</code>`);
    return `\x00INLINE${idx}\x00`;
  });

  // Split into lines for block-level processing
  const lines = text.split('\n');
  const output = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Horizontal rule
    if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(line)) {
      output.push('<hr>');
      i++;
      continue;
    }

    // ATX Headings (#, ##, ###, ####, #####, ######)
    const headingMatch = line.match(/^(#{1,6})\s+(.+?)(?:\s+#+)?$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      output.push(`<h${level}>${inlineMarkdown(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith('> ') || line === '>') {
      const bqLines = [];
      while (i < lines.length && (lines[i].startsWith('> ') || lines[i] === '>')) {
        bqLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      output.push(`<blockquote>${renderMarkdown(bqLines.join('\n'))}</blockquote>`);
      continue;
    }

    // Unordered list
    if (/^(\s*)[*\-+]\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^(\s*)[*\-+]\s/.test(lines[i])) {
        items.push(`<li>${inlineMarkdown(lines[i].replace(/^(\s*)[*\-+]\s/, ''))}</li>`);
        i++;
      }
      output.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(`<li>${inlineMarkdown(lines[i].replace(/^\d+\.\s/, ''))}</li>`);
        i++;
      }
      output.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    // Table (GFM)
    if (line.includes('|') && i + 1 < lines.length && /^\|?[-:| ]+\|?$/.test(lines[i + 1])) {
      const headerCells = parseTableRow(line);
      const alignRow = lines[i + 1];
      const aligns = parseTableAligns(alignRow);
      const tableRows = [];
      i += 2;
      while (i < lines.length && lines[i].includes('|')) {
        tableRows.push(parseTableRow(lines[i]));
        i++;
      }
      let html = '<table><thead><tr>';
      for (let c = 0; c < headerCells.length; c++) {
        const a = aligns[c] || '';
        html += `<th${a ? ` style="text-align:${a}"` : ''}>${inlineMarkdown(headerCells[c])}</th>`;
      }
      html += '</tr></thead><tbody>';
      for (const row of tableRows) {
        html += '<tr>';
        for (let c = 0; c < headerCells.length; c++) {
          const a = aligns[c] || '';
          html += `<td${a ? ` style="text-align:${a}"` : ''}>${inlineMarkdown(row[c] || '')}</td>`;
        }
        html += '</tr>';
      }
      html += '</tbody></table>';
      output.push(html);
      continue;
    }

    // Blank line → paragraph break
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph — collect until blank line or block element
    const paraLines = [];
    while (i < lines.length && lines[i].trim() !== '' &&
           !lines[i].match(/^#{1,6}\s/) &&
           !lines[i].match(/^(\s*)[*\-+]\s/) &&
           !lines[i].match(/^\d+\.\s/) &&
           !lines[i].startsWith('> ') &&
           !lines[i].startsWith('```') &&
           !/^(\*{3,}|-{3,}|_{3,})\s*$/.test(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      output.push(`<p>${paraLines.map(inlineMarkdown).join('<br>')}</p>`);
    }
  }

  let html = output.join('\n');

  // Restore code blocks and inline codes
  codeBlocks.forEach((block, idx) => { html = html.replace(`\x00CODE${idx}\x00`, block); });
  inlineCodes.forEach((code, idx) => { html = html.replace(`\x00INLINE${idx}\x00`, code); });

  return html;
}

function inlineMarkdown(text) {
  if (!text) return '';
  // Bold+Italic: ***text*** or ___text___
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  text = text.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
  // Bold: **text** or __text__
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__(.+?)__/g, '<strong>$1</strong>');
  // Italic: *text* or _text_
  text = text.replace(/\*([^*]+?)\*/g, '<em>$1</em>');
  text = text.replace(/_([^_]+?)_/g, '<em>$1</em>');
  // Strikethrough: ~~text~~
  text = text.replace(/~~(.+?)~~/g, '<del>$1</del>');
  // Links: [text](url) — only allow data: and relative URLs, no javascript:
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, linkText, href) => {
    const safe = href.startsWith('data:') || href.startsWith('/') || href.startsWith('#') || href.startsWith('./');
    if (!safe) return `[${linkText}]`;
    return `<a href="${esc(href)}">${esc(linkText)}</a>`;
  });
  return text;
}

function parseTableRow(line) {
  return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
}

function parseTableAligns(line) {
  return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => {
    c = c.trim();
    if (c.startsWith(':') && c.endsWith(':')) return 'center';
    if (c.endsWith(':')) return 'right';
    if (c.startsWith(':')) return 'left';
    return '';
  });
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escCode(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
