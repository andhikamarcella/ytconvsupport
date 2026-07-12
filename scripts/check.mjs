import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.vercel') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

const files = await walk(process.cwd());
const jsFiles = files.filter((file) => ['.js', '.mjs'].includes(extname(file)));
let failed = false;
for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed = true;
    console.error(result.stderr || result.stdout);
  }
}

for (const file of files.filter((file) => extname(file) === '.html')) {
  const html = await readFile(file, 'utf8');
  if (!html.includes('<!doctype html>') && !html.includes('<!DOCTYPE html>')) {
    failed = true;
    console.error(`${file}: missing doctype`);
  }
}

if (failed) process.exit(1);
console.log(`Checked ${jsFiles.length} JavaScript files and ${files.filter((f) => extname(f) === '.html').length} HTML files.`);
