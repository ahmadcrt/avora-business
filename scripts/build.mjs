#!/usr/bin/env node
// Zero-dependency build. Copies the static site into dist/ and injects PUBLIC config.
// Env: AVORA_ENV, AVORA_BASE_PATH (default /avora-business/), SUPABASE_URL, SUPABASE_ANON_KEY
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBasePath, validatePublicKey, validateSupabaseUrl } from './lib-env.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.env.AVORA_OUT_DIR ? process.env.AVORA_OUT_DIR : join(root, 'dist');

const env = {
  AVORA_ENV: process.env.AVORA_ENV || 'development',
  AVORA_BASE_PATH: process.env.AVORA_BASE_PATH || '/avora-business/',
  SUPABASE_URL: (process.env.SUPABASE_URL || '').trim(),
  SUPABASE_ANON_KEY: (process.env.SUPABASE_ANON_KEY || '').trim(),
};

const problems = [
  ...validateBasePath(env.AVORA_BASE_PATH),
  ...validateSupabaseUrl(env.SUPABASE_URL),
  ...validatePublicKey(env.SUPABASE_ANON_KEY),
];
if (problems.length) {
  console.error('Build refused:\n - ' + problems.join('\n - '));
  process.exit(1);
}

const INCLUDE = ['index.html', '404.html', 'styleguide.html', 'robots.txt', 'assets', 'logos', 'merchant'];
const TEXT_EXT = new Set(['.html', '.js', '.css']);

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
for (const item of INCLUDE) {
  try { await stat(join(root, item)); } catch { continue; }
  await cp(join(root, item), join(outDir, item), { recursive: true });
}

const replacements = {
  __BASE_PATH__: env.AVORA_BASE_PATH,
  __AVORA_ENV__: env.AVORA_ENV,
  __SUPABASE_URL__: env.SUPABASE_URL,
  __SUPABASE_ANON_KEY__: env.SUPABASE_ANON_KEY,
};

for await (const file of walk(outDir)) {
  if (!TEXT_EXT.has(extname(file))) continue;
  let text = await readFile(file, 'utf8');
  let changed = false;
  for (const [token, value] of Object.entries(replacements)) {
    if (text.includes(token)) { text = text.split(token).join(value); changed = true; }
  }
  if (changed) await writeFile(file, text);
}

await writeFile(
  join(outDir, 'build-info.json'),
  JSON.stringify({ builtAt: new Date().toISOString(), commit: process.env.GITHUB_SHA || null, environment: env.AVORA_ENV }, null, 2) + '\n',
);

console.log(`Built to ${outDir} (base path ${env.AVORA_BASE_PATH}, env ${env.AVORA_ENV}, Supabase ${env.SUPABASE_URL ? 'configured' : 'NOT configured'})`);
