// Recolors the profile-summary-cards SVGs (tokyonight theme) to the cyan NOXELUM palette.
// Usage: node scripts/theme.mjs   (reads profile-summary-card-output/tokyonight, writes assets/)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const SRC = 'profile-summary-card-output/tokyonight';
const FILES = {
  '2-most-commit-language.svg': 'assets/lang-commit.svg',
  '1-repos-per-language.svg': 'assets/lang-repo.svg',
  '4-productive-time.svg': 'assets/productive-time.svg',
};
const MAP = { '#1a1b27': '#0B1B27', '#70a5fd': '#56E5F6', '#38bdae': '#E6F7FB', '#bf91f3': '#56E5F6' };

export function recolor(svg) {
  // cyan border on the card background rect
  svg = svg.replace(/<rect[^>]*>/, (rect) =>
    rect.replace(/stroke="#1a1b27"/, 'stroke="#56E5F6"').replace(/stroke-opacity="1"/, 'stroke-opacity="0.35"'));
  return svg.replace(/#[0-9a-fA-F]{6}\b/g, (m) => MAP[m.toLowerCase()] ?? m);
}

mkdirSync('assets', { recursive: true });
for (const [from, to] of Object.entries(FILES)) {
  const path = `${SRC}/${from}`;
  if (!existsSync(path)) { console.warn(`skip ${path}: not found`); continue; }
  writeFileSync(to, recolor(readFileSync(path, 'utf8')));
  console.log(`wrote ${to}`);
}
