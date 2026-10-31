// Builds the Ravian addon list: public/index.json and its signature public/index.json.sig.
// Each file in addons/ is one reviewed addon: { "url", "sha256", "reviewed" }. The build reads each manifest again. An
// addon whose manifest changed after the review leaves the list, and the build names it in public/changed.txt.
// Node 18 or newer, no packages.
//
//   REGISTRY_KEY="$(cat key.pem)" node tools/build.js    the list, signed (ECDSA P-256, SHA-256, DER, base64)
//   node tools/build.js entry <url>                      the file for a new addon, after a review
import { createHash, createPrivateKey, sign } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const base = (url) => url.trim().replace(/\/+$/, '').replace(/\/manifest\.json$/, '');

async function manifest(url) {
  const res = await fetch(`${base(url)}/manifest.json`, { signal: AbortSignal.timeout(15_000), headers: { 'User-Agent': 'ravian-addons/1' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  return { bytes, json: JSON.parse(bytes.toString('utf8')), sha256: createHash('sha256').update(bytes).digest('hex') };
}

if (process.argv[2] === 'entry') {
  const url = base(process.argv[3] || '');
  if (!url.startsWith('https://')) throw new Error('The addon URL must start with https://');
  const m = await manifest(url);
  console.log(`addons/${m.json.id}.json`);
  console.log(JSON.stringify({ url, sha256: m.sha256, reviewed: new Date().toISOString().slice(0, 10) }, null, 2));
  process.exit(0);
}

const addons = [];
const changed = [];
for (const file of readdirSync('addons').filter((f) => f.endsWith('.json')).sort()) {
  const entry = JSON.parse(readFileSync(`addons/${file}`, 'utf8'));
  try {
    const m = await manifest(entry.url);
    if (m.sha256 !== entry.sha256) throw new Error('the manifest changed after the review');
    const { id, name, description, scope } = m.json;
    addons.push({ id, name, description, url: base(entry.url), host: new URL(entry.url).host, scope, reviewed: entry.reviewed });
  } catch (e) {
    changed.push(`${file}: ${e.message}`);
  }
}

const index = Buffer.from(JSON.stringify({
  version: 1,
  made: new Date().toISOString(),
  addons,
  // Manifest ids that the apps turn off, also when the user added the addon by its URL.
  blocked: JSON.parse(readFileSync('blocked.json', 'utf8')),
  // The lowest app version code that may use online sources (app.json). An older app asks the user to update.
  ...JSON.parse(readFileSync('app.json', 'utf8')),
}, null, 2) + '\n');

mkdirSync('public', { recursive: true });
writeFileSync('public/index.json', index);
writeFileSync('public/changed.txt', changed.join('\n') + (changed.length ? '\n' : ''));
if (process.env.REGISTRY_KEY) {
  const key = createPrivateKey(process.env.REGISTRY_KEY);
  writeFileSync('public/index.json.sig', sign('sha256', index, key).toString('base64') + '\n');
} else {
  console.log('No REGISTRY_KEY: the list is not signed, and the apps refuse it.');
}
console.log(`${addons.length} addons in the list, ${changed.length} left out`);
for (const line of changed) console.log(`  left out: ${line}`);
