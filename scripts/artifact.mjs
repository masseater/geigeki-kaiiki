// vite の単一HTMLを claude.ai Artifact 用に整形する。
// Artifact は公開時に <!doctype>〜<body> の骨組みを自前で付けるので、中身だけを並べ直す。
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('dist-artifact/index.html', 'utf8');
const head = src.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
const body = src.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? '';
const pick = (re) => head.match(re)?.[0] ?? '';

const title = pick(/<title>[\s\S]*?<\/title>/);
const sides = pick(/<meta name="claude:viewport-fit-sides"[^>]*>/);
const links = [...head.matchAll(/<link [^>]*fonts\.(googleapis|gstatic)[^>]*>/g)].map((m) => m[0]).join('\n');
const styles = [...head.matchAll(/<style[\s\S]*?<\/style>/g)].map((m) => m[0]).join('\n');
const scripts = [...head.matchAll(/<script[\s\S]*?<\/script>/g)].map((m) => m[0]).join('\n');
const bodyNoScripts = body.replace(/<script[\s\S]*?<\/script>/g, '').trim();

if (!title || !scripts) throw new Error('title か script が見つかりません');
const out = [title, sides, links, styles, bodyNoScripts, scripts].filter(Boolean).join('\n');
writeFileSync('dist-artifact/artifact.html', out);
console.log(`dist-artifact/artifact.html ${(out.length / 1024).toFixed(0)} KB`);
