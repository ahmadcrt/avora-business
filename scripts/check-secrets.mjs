#!/usr/bin/env node
// Zero-dependency secret scan for this repository. Exit code 1 if anything is found.
// Complements (does not replace) GitHub secret scanning and push protection.
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodeJwtPayload } from './lib-env.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'coverage']);
const BINARY = /\.(woff2?|png|jpe?g|webp|gif|ico|zip|pdf)$/i;
const FRONTEND = /^(assets|logos|templates|merchant)\/|^[^/]+\.html$/;

const PATTERNS = [
  ['Supabase secret key', /sb_secret_[A-Za-z0-9_-]{10,}/],
  ['Private key block', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |)PRIVATE KEY-----/],
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|github_pat_[A-Za-z0-9_]{30,}/],
  ['AWS access key id', /\bAKIA[0-9A-Z]{16}\b/],
  ['Email provider API key', /\b(?:re_[A-Za-z0-9]{20,}|xkeysib-[A-Za-z0-9-]{20,}|SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,})\b/],
  ['Database URL with password', /postgres(?:ql)?:\/\/[^:\s/@]+:[^@\s]+@(?!(?:127\.0\.0\.1|localhost)\b)[^\s/]+/],
];
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) yield* walk(join(dir, entry.name)); }
    else yield join(dir, entry.name);
  }
}

/** Scan one file's text. Exposed for tests. */
export function scanText(relPath, text) {
  const findings = [];
  for (const [label, re] of PATTERNS) if (re.test(text)) findings.push(`${relPath}: ${label}`);
  for (const match of text.match(JWT) ?? []) {
    const role = decodeJwtPayload(match)?.role;
    if (role && role !== 'anon') findings.push(`${relPath}: JWT with role "${role}" (only the public anon role is allowed)`);
  }
  if (FRONTEND.test(relPath) && /service[_-]?role/i.test(text)) findings.push(`${relPath}: mentions service role in frontend code`);
  return findings;
}

export async function scanRepo() {
  const findings = [];
  for await (const file of walk(root)) {
    const rel = relative(root, file).split('\\').join('/');
    const name = basename(file);
    if ((name === '.env' || (name.startsWith('.env.') && name !== '.env.example'))) findings.push(`${rel}: environment file present in the working tree`);
    if (BINARY.test(file)) continue;
    // The scanner and its tests contain the detection patterns themselves.
    if (rel === 'scripts/check-secrets.mjs' || rel === 'tests/secrets.test.mjs') continue;
    findings.push(...scanText(rel, await readFile(file, 'utf8')));
  }
  return findings;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const findings = await scanRepo();
  if (findings.length) { console.error('Possible secrets found:\n - ' + findings.join('\n - ')); process.exit(1); }
  console.log('No secrets found.');
}
