import pc from 'picocolors';
import type { EngineEmitter } from '../core/events.js';
import { formatDuration, localDateTime, localTime } from '../core/time.js';
import type { Terminal } from './terminal.js';

/** Prints engine events to the terminal, above the status line. */
export function attachConsoleSink(
  events: EngineEmitter,
  term: Terminal,
  opts: { markdownPath: () => string },
): void {
  const log = (text = '') => term.log(text);

  events.on('run:start', ({ startedAt, companies, keywords, intervalMinutes }) => {
    log(pc.bold(`\njob-alert started at ${localDateTime(startedAt)}`));
    log(`  Companies: ${companies.length} (${companies.map((c) => c.name).join(', ')})`);
    log(`  Keywords : ${keywords.map((k) => pc.cyan(k)).join(' AND ')}`);
    log(`  Interval : every ${intervalMinutes} min`);
    log();
  });

  events.on('scan:start', ({ scanNo, startedAt, trigger }) => {
    const manual = trigger === 'manual' ? pc.magenta(' (manual)') : '';
    log(pc.bold(`▶ Scan #${scanNo} started ${localDateTime(startedAt)}`) + manual);
  });

  events.on('scan:end', (r) => {
    for (const m of r.newMatches) {
      const j = m.job;
      log(`  ${pc.green(pc.bold('[NEW]'))} ${pc.bold(j.companyName)} · ${j.title}${j.url ? ` · ${pc.underline(j.url)}` : ''}`);
    }
    for (const e of r.errors) {
      log(`  ${pc.red('[ERR]')} ${e.company.name} (${e.company.ats}/${e.company.token}): ${e.message}`);
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
    log(pc.bold(`✔ Scan #${r.scanNo} ended ${localDateTime(r.endedAt)} (${formatDuration(r.durationMs)})`) + `  ${summary}`);
    if (r.newMatches.length) log(pc.dim(`  Written to ${opts.markdownPath()}`));
  });

  events.on('scan:failed', ({ scanNo, error }) => {
    log(pc.red(`✘ Scan #${scanNo} failed: ${error.message}`));
  });

  events.on('idle', ({ nextScanAt, runStartedAt }) => {
    const uptime = formatDuration(Date.now() - runStartedAt.getTime());
    log(pc.dim(`  Running for ${uptime} · next scan at ${localTime(nextScanAt)}\n`));
  });

  events.on('run:stop', ({ startedAt, stoppedAt, scans }) => {
    log(pc.bold(`\njob-alert stopped at ${localDateTime(stoppedAt)}`));
    log(`  Started ${localDateTime(startedAt)} · ran ${formatDuration(stoppedAt.getTime() - startedAt.getTime())} · ${scans} scan(s)`);
  });
}
