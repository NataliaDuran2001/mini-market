#!/usr/bin/env node
// Progress against the frozen baseline (docs/baseline.json) using GitHub issue close dates.
// Usage: node scripts/baseline-status.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = 'NataliaDuran2001/mini-market';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const baseline = JSON.parse(readFileSync(join(root, 'docs', 'baseline.json'), 'utf8'));

const raw = execFileSync(
  'gh',
  [
    'issue',
    'list',
    '--repo',
    REPO,
    '--state',
    'all',
    '--limit',
    '300',
    '--json',
    'number,state,closedAt',
  ],
  { encoding: 'utf8' },
);
const closedAt = new Map();
for (const i of JSON.parse(raw))
  if (i.state === 'CLOSED') closedAt.set(i.number, new Date(i.closedAt));

const t0 = new Date(baseline.laneT0);
const now = new Date();
const days = (ms) => ms / 86_400_000;
const fmt = (n) => (Math.round(n * 100) / 100).toString();
const pad = (s, n) => String(s).padEnd(n);

const allIssues = baseline.issues;
const deferred = allIssues.filter((i) => i.deferred);
const issues = allIssues.filter((i) => !i.deferred);
const done = issues.filter((i) => closedAt.has(i.number));
const planDone = done.reduce((a, i) => a + i.estimate, 0);
const planTotal = issues.reduce((a, i) => a + i.estimate, 0);
const elapsed = days(now - t0);

console.log(`Baseline frozen ${baseline.frozenOn}, lane T0 ${baseline.laneT0}`);
console.log(`Now ${now.toISOString()}  elapsed ${fmt(elapsed)} calendar days\n`);

console.log(
  pad('Milestone', 40),
  pad('Closed', 9),
  pad('Plan days', 11),
  pad('Plan finish', 12),
  'Last closed',
);
for (const m of baseline.milestones) {
  const its = issues.filter((i) => i.milestone === m.key);
  const c = its.filter((i) => closedAt.has(i.number));
  const last = c.length
    ? new Date(Math.max(...c.map((i) => closedAt.get(i.number)))).toISOString().slice(0, 16)
    : '-';
  const pd = c.reduce((a, i) => a + i.estimate, 0);
  console.log(
    pad(m.title, 40),
    pad(`${c.length}/${its.length}`, 9),
    pad(`${fmt(pd)}/${fmt(m.planDays)}`, 11),
    pad(`day ${fmt(m.laneFinish)}`, 12),
    last,
  );
}

console.log('\n' + pad('Lane', 6), pad('Closed', 9), 'Next open issue');
for (const lane of ['P1', 'P2', 'P3', 'C', 'S', 'B', 'R']) {
  const its = issues.filter((i) => i.lane === lane);
  const next = its.find((i) => !closedAt.has(i.number));
  console.log(
    pad(lane, 6),
    pad(`${its.filter((i) => closedAt.has(i.number)).length}/${its.length}`, 9),
    next ? `#${next.number} ${next.title}` : 'lane complete',
  );
}

console.log(`\nPlan days closed ${fmt(planDone)} of ${fmt(planTotal)}`);
if (planDone >= 3 && elapsed >= 0.5) {
  const throughput = planDone / elapsed;
  const remaining = planTotal - planDone;
  const eta = new Date(now.getTime() + (remaining / throughput) * 86_400_000);
  console.log(
    `Observed throughput ${fmt(throughput)} plan days per calendar day (includes parallelism)`,
  );
  console.log(
    `Naive forecast of the remaining ${fmt(remaining)} plan days: ${eta.toISOString().slice(0, 10)}`,
  );
  console.log(
    'Forecast is informational. The baseline stays as frozen; recalibrate when M1 closes.',
  );
} else {
  console.log(
    'Not enough data to forecast yet (needs at least 3 plan days closed and half a calendar day elapsed).',
  );
}
