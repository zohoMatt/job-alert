import pc from 'picocolors';
import { EngineEmitter } from '../../core/events.js';
import { runScan } from '../../core/scanner.js';
import { Scheduler } from '../../core/scheduler.js';
import { KeywordMatcher } from '../../matching/keyword-matcher.js';
import { attachConsoleSink } from '../../output/console-sink.js';
import { attachMarkdownSink } from '../../output/markdown-sink.js';
import { emptyCompaniesFile, loadCompanies, saveCompanies } from '../../store/companies-store.js';
import { loadConfig, saveConfig, type RunConfig } from '../../store/config-store.js';
import { MatchLog } from '../../store/match-log.js';
import { paths } from '../../store/paths.js';
import { promptRunConfig } from '../prompts.js';

export interface RunOptions {
  /** Ask for settings. `--no-prompt` sets this to false and uses data/config.json as is. */
  prompt: boolean;
  /** Run a single scan and exit. */
  once?: boolean;
}

export async function runCommand(opts: RunOptions): Promise<void> {
  const companiesFile = (await loadCompanies()) ?? emptyCompaniesFile();
  const all = companiesFile.companies;

  const saved = await loadConfig();
  let config: RunConfig;
  if (opts.prompt) {
    const result = await promptRunConfig(all, saved);
    if (!result) {
      console.log(pc.dim('Not started. Nothing was saved.'));
      return;
    }
    if (result.added.length) {
      all.push(...result.added);
      await saveCompanies(companiesFile);
    }
    config = result.config;
    await saveConfig(config);
  } else if (saved) {
    config = saved;
  } else {
    throw new Error(`No saved settings in ${paths.config}. Run without --no-prompt once.`);
  }

  const missing = config.companyIds.filter((id) => !all.some((c) => c.id === id));
  if (missing.length) console.log(pc.yellow(`Ignoring companies no longer in companies.json: ${missing.join(', ')}`));
  const companies = all.filter((c) => config.companyIds.includes(c.id));
  if (companies.length === 0) throw new Error('None of the selected companies are in companies.json.');

  const events = new EngineEmitter();
  const markdown = attachMarkdownSink(events, config.keywords);
  attachConsoleSink(events, { markdownPath: markdown.currentPath });

  const log = await MatchLog.open();
  const matcher = new KeywordMatcher(config.keywords);

  const scan = async (scanNo: number) => {
    events.emit('scan:start', { scanNo, startedAt: new Date() });
    const report = await runScan({ scanNo, companies, matcher, keywords: config.keywords, log });
    await log.append(report.newMatches);
    events.emit('scan:end', report);
    await markdown.flush();
  };

  const scheduler = new Scheduler(config.intervalMinutes * 60_000, scan, events);
  events.emit('run:start', {
    startedAt: scheduler.startedAt,
    companies,
    keywords: config.keywords,
    intervalMinutes: config.intervalMinutes,
  });

  if (opts.once) {
    await scan(1);
    events.emit('run:stop', { startedAt: scheduler.startedAt, stoppedAt: new Date(), scans: 1 });
    return;
  }

  let stopping = false;
  const shutdown = async () => {
    if (stopping) process.exit(130); // second Ctrl+C: quit immediately
    stopping = true;
    console.log(pc.dim('\nStopping (finishing the current scan)...'));
    await scheduler.stop();
    await markdown.flush();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  scheduler.start();
}
