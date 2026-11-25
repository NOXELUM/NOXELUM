// Generates assets/streak.svg (cyan NOXELUM theme) from the GitHub contribution calendar.
// Usage: GH_TOKEN=... node scripts/streak.mjs <login> [out.svg]   |   node scripts/streak.mjs --demo
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const API = 'https://api.github.com/graphql';

async function gql(query, variables, token) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'streak-card' },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (!r.ok || j.errors) throw new Error(`GraphQL failed: ${r.status} ${JSON.stringify(j.errors || j)}`);
  return j.data;
}

async function fetchDays(login, token) {
  const created = (await gql('query($l:String!){user(login:$l){createdAt}}', { l: login }, token)).user.createdAt;
  const start = new Date(created).getUTCFullYear();
  const end = new Date().getUTCFullYear();
  const days = [];
  for (let y = start; y <= end; y++) {
    const d = await gql(
      `query($l:String!,$f:DateTime!,$t:DateTime!){user(login:$l){contributionsCollection(from:$f,to:$t){contributionCalendar{weeks{contributionDays{date contributionCount}}}}}}`,
      { l: login, f: `${y}-01-01T00:00:00Z`, t: `${y}-12-31T23:59:59Z` },
      token,
    );
    for (const w of d.user.contributionsCollection.contributionCalendar.weeks)
      for (const c of w.contributionDays) days.push({ date: c.date, count: c.contributionCount });
  }
  const map = new Map();
  for (const d of days) map.set(d.date, d.count); // de-dupe overlapping weeks
  return [...map.entries()].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
}

const addDay = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export function computeStreaks(days, todayIso = new Date().toISOString().slice(0, 10)) {
  const past = days.filter((d) => d.date <= todayIso);
  const total = past.reduce((s, d) => s + d.count, 0);
  let longest = { len: 0, from: null, to: null };
  let run = null;
  for (const d of past) {
    if (d.count > 0) {
      if (run && addDay(run.to, 1) === d.date) { run.to = d.date; run.len++; }
      else run = { from: d.date, to: d.date, len: 1 };
      if (run.len > longest.len) longest = { ...run };
    } else run = null;
  }
  // current streak: today may still be empty (day not over), so allow it to start from yesterday
  const byDate = new Map(past.map((d) => [d.date, d.count]));
  let cur = { len: 0, from: null, to: null };
  let cursor = (byDate.get(todayIso) || 0) > 0 ? todayIso : addDay(todayIso, -1);
  while ((byDate.get(cursor) || 0) > 0) {
    cur = { len: cur.len + 1, from: cursor, to: cur.to || cursor };
    cursor = addDay(cursor, -1);
  }
  return { total, current: cur, longest, since: past.length ? past[0].date : null };
}

const fmt = (iso) => (iso ? new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '—');
const fmtY = (iso) => (iso ? new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '—');
const range = (s) => (s.len ? `${fmt(s.from)} – ${fmt(s.to)}` : 'No streak yet');

export function render(login, s) {
  const bg = '#0B1B27', line = '#56E5F6', dim = '#7FA3B5', txt = '#E6F7FB';
  const cx = [116.7, 350, 583.3]; // three equal columns across 700px
  return `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="200" viewBox="0 0 700 200" role="img" aria-label="${login} contribution streak">
  <rect x="1" y="1" width="698" height="198" rx="5" fill="${bg}" stroke="${line}" stroke-opacity="0.35"/>
  <g font-family="Segoe UI, Ubuntu, 'Helvetica Neue', Arial, sans-serif" text-anchor="middle">
    <line x1="233.3" y1="40" x2="233.3" y2="160" stroke="${line}" stroke-opacity="0.2"/>
    <line x1="466.7" y1="40" x2="466.7" y2="160" stroke="${line}" stroke-opacity="0.2"/>
    <text x="${cx[0]}" y="102" font-size="40" font-weight="700" fill="${line}">${s.total.toLocaleString('en-US')}</text>
    <text x="${cx[0]}" y="130" font-size="14" font-weight="600" fill="${txt}">Total contributions</text>
    <text x="${cx[0]}" y="150" font-size="11" fill="${dim}">${fmtY(s.since)} – Present</text>
    <circle cx="${cx[1]}" cy="84" r="42" fill="none" stroke="${line}" stroke-width="4"/>
    <text x="${cx[1]}" y="96" font-size="34" font-weight="700" fill="${line}">${s.current.len}</text>
    <text x="${cx[1]}" y="150" font-size="14" font-weight="600" fill="${txt}">Current streak</text>
    <text x="${cx[1]}" y="170" font-size="11" fill="${dim}">${range(s.current)}</text>
    <text x="${cx[2]}" y="102" font-size="40" font-weight="700" fill="${line}">${s.longest.len}</text>
    <text x="${cx[2]}" y="130" font-size="14" font-weight="600" fill="${txt}">Longest streak</text>
    <text x="${cx[2]}" y="150" font-size="11" fill="${dim}">${range(s.longest)}</text>
  </g>
</svg>
`;
}

async function main() {
  const [a, b] = process.argv.slice(2);
  if (a === '--demo') {
    const today = '2026-11-13', days = [];
    for (let i = 0; i < 400; i++) { const d = addDay('2025-10-10', i); days.push({ date: d, count: i % 9 === 0 ? 0 : (i % 4) + 1 }); }
    const s = computeStreaks(days, today); console.log(JSON.stringify(s));
    mkdirSync('demo', { recursive: true }); writeFileSync('demo/streak.svg', render('demo', s)); return;
  }
  const login = a, out = b || 'assets/streak.svg', token = process.env.GH_TOKEN;
  if (!login || !token) throw new Error('usage: GH_TOKEN=... node scripts/streak.mjs <login> [out.svg]');
  const s = computeStreaks(await fetchDays(login, token));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, render(login, s));
  console.log(`wrote ${out}: total=${s.total} current=${s.current.len} longest=${s.longest.len}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
