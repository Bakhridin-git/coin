#!/usr/bin/env node
/* eslint-disable */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Extract the <style>...</style> contents from an HTML file and wrap every
 * top-level selector with a scope class so the styles can't leak elsewhere.
 *
 * Usage: node scripts/scope-css.mjs <input.html> <scope-class> <output.css>
 *
 * Rules:
 *   - body / html / :root / *          → scope class (so base page styles apply
 *     to the scoped container)
 *   - "body foo"                       → "<scope> foo"
 *   - plain selector                   → "<scope> selector"
 *   - selector starting with <scope>   → left as is
 *   - @media / @supports / @container  → recurse inside
 *   - other at-rules (@keyframes etc)  → left as is
 */

const [, , inputPath, scopeClassArg, outputPath] = process.argv;
if (!inputPath || !scopeClassArg || !outputPath) {
  console.error('Usage: node scripts/scope-css.mjs <input.html> <scope-class> <output.css>');
  process.exit(1);
}

const scope = scopeClassArg.startsWith('.') ? scopeClassArg : `.${scopeClassArg}`;
const html = fs.readFileSync(inputPath, 'utf8');
const match = html.match(/<style[^>]*>([\s\S]*?)<\/style>/);
if (!match) {
  console.error(`No <style> block found in ${inputPath}`);
  process.exit(1);
}

const css = match[1];

function scopeCss(input, scope) {
  let i = 0;
  let out = '';
  const n = input.length;
  while (i < n) {
    // whitespace passthrough
    while (i < n && /\s/.test(input[i])) {
      out += input[i];
      i++;
    }
    if (i >= n) break;

    // comments passthrough
    if (input[i] === '/' && input[i + 1] === '*') {
      const end = input.indexOf('*/', i);
      if (end < 0) {
        out += input.slice(i);
        break;
      }
      out += input.slice(i, end + 2);
      i = end + 2;
      continue;
    }

    // find '{' for this rule — but ignore semicolons ending at-rules like @charset
    const braceStart = input.indexOf('{', i);
    const semi = input.indexOf(';', i);
    if (semi !== -1 && (braceStart === -1 || semi < braceStart)) {
      out += input.slice(i, semi + 1);
      i = semi + 1;
      continue;
    }
    if (braceStart < 0) {
      out += input.slice(i);
      break;
    }

    const prelude = input.slice(i, braceStart).trim();

    // match the block
    let depth = 1;
    let j = braceStart + 1;
    while (j < n && depth > 0) {
      const c = input[j];
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) break;
      }
      j++;
    }
    const body = input.slice(braceStart + 1, j);

    if (prelude.startsWith('@')) {
      if (/^@(media|supports|container|layer)\b/.test(prelude)) {
        const inner = scopeCss(body, scope);
        out += `${prelude} {${inner}}`;
      } else {
        out += `${prelude} {${body}}`;
      }
    } else {
      const selectors = prelude
        .split(/\s*,\s*/)
        .map((s) => s.trim())
        .filter(Boolean);
      const scoped = selectors.flatMap((sel) => {
        if (sel === '*') return [`${scope}`, `${scope} *`];
        if (sel === 'html' || sel === ':root' || sel === 'body') return [scope];
        if (/^body\b/.test(sel)) return [`${scope}${sel.slice(4)}`]; // e.g. "body.coin-page" → ".scope.coin-page"
        if (sel.startsWith(scope)) return [sel];
        return [`${scope} ${sel}`];
      });
      out += `${scoped.join(', ')} {${body}}`;
    }

    i = j + 1;
  }
  return out;
}

const scoped = scopeCss(css, scope);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `/* Auto-generated from ${path.basename(inputPath)}. Do not edit directly. */\n${scoped}\n`);
console.log(`Wrote ${outputPath} (${scoped.length} chars, scope: ${scope})`);
