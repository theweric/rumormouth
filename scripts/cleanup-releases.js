/**
 * cleanup-releases.js — one-time (and safe-to-rerun) cleanup for posts that
 * were published to content/posts/ BEFORE the on-topic/English filter was
 * added to fetch-feed.js.
 *
 * The GitHub Action only ever ADDS new posts — it never retroactively
 * removes ones that would now be filtered out. So a run of fetch-feed.js
 * from before RELEASE_BLOCKLIST / looksEnglish() existed can leave stale
 * off-topic or non-English releases sitting in the repo indefinitely.
 * This script finds and removes exactly those, using the *same* filter
 * logic fetch-feed.js applies to new posts (imported directly from there,
 * so the two can never drift out of sync).
 *
 * USAGE:
 *   node cleanup-releases.js          — dry run, lists what WOULD be removed
 *   node cleanup-releases.js --apply  — actually deletes the matched files
 *
 * Only touches type: release posts. Wire posts come from mainstream
 * entertainment outlets (Variety, TMZ, etc.) that don't have the same
 * multilingual/off-topic problem PR Newswire's feed does, so they're left
 * alone here.
 */

const fs = require('fs');
const path = require('path');
const { isOnTopicRelease } = require('./fetch-feed.js');

const POSTS_DIR = path.join(__dirname, '..', 'content', 'posts');
const APPLY = process.argv.includes('--apply');

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;
  const [, fmBlock, body] = match;
  const data = {};
  for (const line of fmBlock.split('\n')) {
    const m = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (!m) continue;
    let [, key, value] = m;
    value = value.trim().replace(/^"(.*)"$/, '$1');
    data[key] = value;
  }
  return { data, body };
}

function main() {
  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'));
  const toRemove = [];

  for (const file of files) {
    const fullPath = path.join(POSTS_DIR, file);
    const raw = fs.readFileSync(fullPath, 'utf8');
    const parsed = parseFrontmatter(raw);
    if (!parsed) continue;
    const { data, body } = parsed;

    if (data.type !== 'release') continue;

    // Reconstruct a pseudo-item matching the shape isOnTopicRelease expects.
    const pseudoItem = { title: data.title, content: body, contentSnippet: body };
    if (!isOnTopicRelease(pseudoItem)) {
      toRemove.push({ file, title: data.title });
    }
  }

  if (toRemove.length === 0) {
    console.log('Nothing to remove — all release posts pass the current filter.');
    return;
  }

  console.log(`${toRemove.length} release post(s) fail the current filter (off-topic or non-English):\n`);
  for (const { file, title } of toRemove) {
    console.log(`  - ${title}\n    ${file}`);
  }

  if (APPLY) {
    for (const { file } of toRemove) {
      fs.unlinkSync(path.join(POSTS_DIR, file));
    }
    console.log(`\nDeleted ${toRemove.length} file(s).`);
  } else {
    console.log(`\nDry run only — nothing was deleted. Re-run with --apply to actually remove these files.`);
  }
}

main();
