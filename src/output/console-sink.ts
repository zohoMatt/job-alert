import pc from 'picocolors';
import type { EngineEmitter } from '../core/events.js';
import { formatDuration, localDateTime, localTime } from '../core/time.js';

/** Prints engine events to the terminal. */
export function attachConsoleSink(events: EngineEmitter, opts: { markdownPath: () => string }): void {
  events.on('run:start', ({ startedAt, companies, keywords, intervalMinutes }) => {
    console.log(pc.bold(`\njob-alert started at ${localDateTime(startedAt)}`));
    console.log(`  Companies: ${companies.length} (${companies.map((c) => c.name).join(', ')})`);
    console.log(`  Keywords : ${keywords.map((k) => pc.cyan(k)).join(' AND ')}`);
    console.log(`  Interval : every ${intervalMinutes} min`);
    console.log(pc.dim('  Press Ctrl+C to stop.\n'));
  });

  events.on('scan:start', ({ scanNo, startedAt }) => {
    console.log(pc.bold(`▶ Scan #${scanNo} started ${localDateTime(startedAt)}`));
  });

  events.on('scan:end', (r) => {
    for (const m of r.newMatches) {
      const j = m.job;
      console.log(`  ${pc.green(pc.bold('[NEW]'))} ${pc.bold(j.companyName)} · ${j.title}${j.url ? ` · ${pc.underline(j.url)}` : ''}`);
    }
    for (const e of r.errors) {
      console.log(`  ${pc.red('[ERR]')} ${e.company.name} (${e.company.ats}/${e.company.token}): ${e.message}`);
    }
    const summary = [
      `${r.companiesScanned} companies`,
      `${r.jobsSeen} jobs`,
      `${r.matched} matched`,
      r.newMatches.length ? pc.green(`${r.newMatches.length} new`) : '0 new',
      r.errors.length ? pc.red(`${r.errors.length} failed`) : null,
    ]
      .filter(Boolean)
      .join(' · ');
    console.log(
      pc.bold(`✔ Scan #${r.scanNo} ended ${localDateTime(r.endedAt)} (${formatDuration(r.durationMs)})`) + `  ${summary}`,
    );
    if (r.newMatches.length) console.log(pc.dim(`  Written to ${opts.markdownPath()}`));
  });

  events.on('scan:failed', ({ scanNo, error }) => {
    console.log(pc.red(`✘ Scan #${scanNo} failed: ${error.message}`));
  });

  events.on('idle', ({ nextScanAt, runStartedAt }) => {
    const uptime = formatDuration(Date.now() - runStartedAt.getTime());
    console.log(pc.dim(`  Running for ${uptime} · next scan at ${localTime(nextScanAt)}\n`));
  });

  events.on('run:stop', ({ startedAt, stoppedAt, scans }) => {
    console.log(pc.bold(`\njob-alert stopped at ${localDateTime(stoppedAt)}`));
    console.log(`  Started ${localDateTime(startedAt)} · ran ${formatDuration(stoppedAt.getTime() - startedAt.getTime())} · ${scans} scan(s)`);
  });
}
