// Generates assets/stats.svg: GitHub stats card with a rank, in the cyan NOXELUM theme.
// Rank uses the published github-readme-stats formula (weights and medians below).
// Usage: GH_TOKEN=... node scripts/stats.mjs <login> [out.svg]   |   node scripts/stats.mjs --demo
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const exponentialCdf = (x) => 1 - 2 ** -x;
const logNormalCdf = (x) => x / (1 + x);

export function calculateRank({ commits, prs, issues, reviews, stars, followers }) {
  const W = { commits: 2, prs: 3, issues: 1, reviews: 1, stars: 4, followers: 1 };
  const total = Object.values(W).reduce((a, b) => a + b, 0);
  const score =
    (W.commits * exponentialCdf(commits / 250) +
      W.prs * exponentialCdf(prs / 50) +
      W.issues * exponentialCdf(issues / 25) +
      W.reviews * exponentialCdf(reviews / 2) +
      W.stars * logNormalCdf(stars / 50) +
      W.followers * logNormalCdf(followers / 10)) / total;
  const rank = 1 - score; // lower is better
  const thresholds = [1, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100];
  const levels = ['S', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C'];
  const percentile = rank * 100;
  const level = levels[thresholds.findIndex((t) => percentile <= t)];
  return { level, percentile };
}

async function gql(query, variables, token) {
  const r = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'stats-card' },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (!r.ok || j.errors) throw new Error(`GraphQL failed: ${r.status} ${JSON.stringify(j.errors || j)}`);
  return j.data;
}

async function fetchStats(login, token) {
  const q = `query($l:String!){user(login:$l){
    followers{totalCount}
    pullRequests{totalCount}
    openIssues:issues(states:OPEN){totalCount}
    closedIssues:issues(states:CLOSED){totalCount}
    contributionsCollection{totalCommitContributions totalPullRequestReviewContributions}
    repositoriesContributedTo(first:1,contributionTypes:[COMMIT,ISSUE,PULL_REQUEST,REPOSITORY]){totalCount}
    repositories(ownerAffiliations:OWNER,isFork:false,privacy:PUBLIC,first:100){nodes{stargazers{totalCount}}}
  }}`;
  const u = (await gql(q, { l: login }, token)).user;
  return {
    stars: u.repositories.nodes.reduce((s, r) => s + r.stargazers.totalCount, 0),
    commits: u.contributionsCollection.totalCommitContributions,
    prs: u.pullRequests.totalCount,
    issues: u.openIssues.totalCount + u.closedIssues.totalCount,
    reviews: u.contributionsCollection.totalPullRequestReviewContributions,
    contributedTo: u.repositoriesContributedTo.totalCount,
    followers: u.followers.totalCount,
  };
}

export function render(login, s) {
  const { level, percentile } = calculateRank(s);
  const bg = '#0B1B27', line = '#56E5F6', dim = '#7FA3B5', txt = '#E6F7FB';
  const rows = [
    ['Total Stars Earned', s.stars],
    ['Total Commits (last year)', s.commits],
    ['Total PRs', s.prs],
    ['Total Issues', s.issues],
    ['Contributed to (last year)', s.contributedTo],
  ];
  const r = 38, c = 2 * Math.PI * r;
  const filled = c * (1 - percentile / 100); // fuller ring = better rank
  const list = rows
    .map(([k, v], i) => `<text x="28" y="${72 + i * 26}" font-size="13" fill="${txt}">${k}:</text><text x="258" y="${72 + i * 26}" font-size="13" font-weight="700" fill="${line}">${v.toLocaleString('en-US')}</text>`)
    .join('\n    ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="495" height="195" viewBox="0 0 495 195" role="img" aria-label="${login} GitHub stats, rank ${level}">
  <rect x="0.5" y="0.5" width="494" height="194" rx="10" fill="${bg}" stroke="${line}" stroke-opacity="0.35"/>
  <g font-family="Segoe UI, Ubuntu, 'Helvetica Neue', Arial, sans-serif">
    <text x="28" y="38" font-size="18" font-weight="700" fill="${line}">${login}'s GitHub Stats</text>
    ${list}
    <g transform="translate(400 105)">
      <circle r="${r}" fill="none" stroke="${line}" stroke-opacity="0.18" stroke-width="6"/>
      <circle r="${r}" fill="none" stroke="${line}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${filled.toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90)"/>
      <text text-anchor="middle" y="9" font-size="28" font-weight="700" fill="${line}">${level}</text>
    </g>
    <text x="400" y="168" text-anchor="middle" font-size="10" fill="${dim}">Top ${Math.max(1, Math.round(percentile))}% (est.)</text>
  </g>
</svg>
`;
}

async function main() {
  const [a, b] = process.argv.slice(2);
  if (a === '--demo') {
    const s = { stars: 4, commits: 120, prs: 14, issues: 1, reviews: 3, contributedTo: 3, followers: 5 };
    console.log(JSON.stringify(calculateRank(s)));
    // sanity check against the reference card in the screenshot (Le Hoang Long: 58 stars, 722 commits, 59 PRs, 0 issues -> B+)
    console.log('long', JSON.stringify(calculateRank({ stars: 58, commits: 722, prs: 59, issues: 0, reviews: 0, followers: 5 })));
    mkdirSync('demo', { recursive: true });
    writeFileSync('demo/stats.svg', render('demo', s));
    return;
  }
  const login = a, out = b || 'assets/stats.svg', token = process.env.GH_TOKEN;
  if (!login || !token) throw new Error('usage: GH_TOKEN=... node scripts/stats.mjs <login> [out.svg]');
  const s = await fetchStats(login, token);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, render(login, s));
  console.log(`wrote ${out}: ${JSON.stringify(s)} rank=${calculateRank(s).level}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
