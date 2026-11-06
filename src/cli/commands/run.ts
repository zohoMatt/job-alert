import path from 'node:path';
import pc from 'picocolors';
import { EngineEmitter } from '../../core/events.js';
import { runScan } from '../../core/scanner.js';
import { Scheduler, type ScanTask } from '../../core/scheduler.js';
import { KeywordMatcher } from '../../matching/keyword-matcher.js';
import { attachConsoleSink } from '../../output/console-sink.js';
import { attachMarkdownSink } from '../../output/markdown-sink.js';
import { attachStatusSink } from '../../output/status-sink.js';
import { Terminal } from '../../output/terminal.js';
import { listenForKeys } from '../keyboard.js';
import { openFile } from '../../core/open-file.js';
import { displayPath, latestDailyMarkdown } from '../../output/locations.js';
import { confirm } from '@inquirer/prompts';
import { attachRunRecordSink } from '../../output/run-record-sink.js';
import {
  emptyCompaniesFile,
  loadCompanies,
  saveCompanies,
  type CompaniesFile,
} from '../../store/companies-store.js';
import { loadConfig, saveConfig, type RunConfig } from '../../store/config-store.js';
import { loadLastRun } from '../../store/last-run.js';
import { clearResults, describeResults } from '../../store/results.js';
import { describeLastRun } from '../last-run-summary.js';
import { MatchLog } from '../../store/match-log.js';
import { paths } from '../../store/paths.js';
import { promptRunConfig } from '../prompts.js';

export interface RunOptions {
  /** Ask for settings. `--no-prompt` sets this to false and uses data/config.json as is. */
  prompt: boolean;
  /** Run a single scan and exit. */
  once?: boolean;
  /** Open the result file on exit. `--no-open` sets this to false. */
  open?: boolean;
  /** Delete local search results before starting, without asking. */
  clear?: boolean;
}

export async function runCommand(opts: RunOptions): Promise<void> {
  const companiesFile = (await loadCompanies()) ?? emptyCompaniesFile();
  const all = companiesFile.companies;

  await maybeClearResults(opts);
  const config = await chooseConfig(opts, companiesFile);
  if (!config) return;

  const missing = config.companyIds.filter((id) => !all.some((c) => c.id === id));
  if (missing.length) console.log(pc.yellow(`Ignoring companies no longer in companies.json: ${missing.join(', ')}`));
  const companies = all.filter((c) => config.companyIds.includes(c.id));
  if (companies.length === 0) throw new Error('None of the selected companies are in companies.json.');

  const events = new EngineEmitter();
  const term = new Terminal();
  const markdown = attachMarkdownSink(events, config.keywords);
  const runRecord = attachRunRecordSink(events);
  attachConsoleSink(events, term, { markdownPath: markdown.currentPath });
  const interactive = term.interactive && process.stdin.isTTY === true;
  attachStatusSink(events, term, { keys: !opts.once && interactive });

  const log = await MatchLog.open();
  const matcher = new KeywordMatcher(config.keywords);

  const scan: ScanTask = async (scanNo, trigger) => {
    events.emit('scan:start', { scanNo, startedAt: new Date(), trigger });
    const report = await runScan({
      scanNo,
      companies,
      matcher,
      keywords: config.keywords,
      log,
      onProgress: (done, total) => events.emit('scan:progress', { scanNo, done, total }),
    });
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

  // Auto-open only for a person at a terminal, not when output is piped or scripted.
  const finish = () => showResults(markdown.writtenFiles(), { open: opts.open !== false && interactive });

  if (opts.once) {
    events.emit('state', { state: 'searching', scanNo: 1, nextScanAt: null });
    await scan(1, 'scheduled');
    events.emit('state', { state: 'stopped', scanNo: 1, nextScanAt: null });
    events.emit('run:stop', { startedAt: scheduler.startedAt, stoppedAt: new Date(), scans: 1 });
    await runRecord.flush();
    await finish();
    return;
  }

  let stopping = false;
  let stopKeys = () => {};
  const shutdown = async () => {
    if (stopping) process.exit(130); // pressed again: quit immediately
    stopping = true;
    term.log(pc.dim('\nStopping (finishing the current scan; press q or Ctrl+C again to force)...'));
    await scheduler.stop();
    await markdown.flush();
    await runRecord.flush();
    stopKeys();
    await finish();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  stopKeys = listenForKeys({
    onQuit: () => void shutdown(),
    onScanNow: () => {
      if (stopping) return;
      if (!scheduler.triggerNow()) term.log(pc.dim('  Already searching. Press s again once it is waiting.'));
    },
  });

  scheduler.start();
}

/**
 * Offers to delete the local search results (daily Markdown files and matches.jsonl).
 * `--clear` deletes without asking; otherwise asks only when prompting and there is
 * something to delete. Default answer is No.
 */
async function maybeClearResults(opts: RunOptions): Promise<void> {
  const found = await describeResults();
  if (found.files.length === 0) {
    if (opts.clear) console.log(pc.dim('No local search results to clear.'));
    return;
  }

  if (!opts.clear) {
    if (!opts.prompt) return;
    const days = found.dailyFiles.map((f) => path.basename(f, '.md').replace(/^jobs-/, ''));
    const range = days.length === 0 ? '' : days.length === 1 ? ` (${days[0]})` : ` (${days[0]} to ${days.at(-1)})`;
    console.log();
    console.log(pc.bold('Local search results'));
    console.log(`  ${found.dailyFiles.length} daily file(s)${range} and ${found.matches} recorded match(es) in ${displayPath(paths.outputDir)}`);
    console.log(pc.dim('  Clearing them makes every current match count as new again.'));
    const yes = await confirm({
      message: 'Clear all local search results?',
      default: false,
    });
    if (!yes) return;
  }

  const cleared = await clearResults();
  console.log(pc.yellow(`  Cleared ${cleared.files.length} file(s): ${cleared.dailyFiles.length} daily file(s) and the match log.`));
}

/**
 * Decides the settings for this run:
 * - `--no-prompt`: the saved settings, no questions.
 * - Saved settings exist: show the last run and its settings, ask to reuse them.
 * - Otherwise (or the user says no): the full setup prompts.
 * Returns null when the user does not start.
 */
async function chooseConfig(opts: RunOptions, companiesFile: CompaniesFile): Promise<RunConfig | null> {
  const all = companiesFile.companies;
  const saved = await loadConfig();

  if (!opts.prompt) {
    if (saved) return saved;
    throw new Error(`No saved settings in ${paths.config}. Run without --no-prompt once.`);
  }

  if (saved) {
    const record = await loadLastRun();
    const summary = describeLastRun(record, saved, all);
    if (summary.companies.length > 0) {
      const [first, ...rest] = summary.lines;
      const unclean = record != null && record.stoppedAt == null;
      console.log();
      if (record) console.log(unclean ? pc.yellow(first!) : pc.bold(first!));
      else rest.unshift(first!);
      console.log(pc.bold('Last settings'));
      for (const line of rest) console.log(line);
      console.log();
      if (await confirm({ message: 'Start with these settings?', default: true })) return saved;
      console.log(pc.dim('Set up again; the last values are the defaults.\n'));
    }
  }

  const result = await promptRunConfig(all, saved);
  if (!result) {
    console.log(pc.dim('Not started. Nothing was saved.'));
    return null;
  }
  if (result.added.length) {
    all.push(...result.added);
    await saveCompanies(companiesFile);
  }
  await saveConfig(result.config);
  return result.config;
}

/**
 * Prints where results are and opens the Markdown file: the newest one written in
 * this run, or else the most recent daily file from earlier runs.
 */
async function showResults(written: string[], opts: { open: boolean }): Promise<void> {
  console.log(pc.bold('\nResults'));
  if (written.length) {
    for (const f of written) console.log(`  ${displayPath(f)}`);
  } else {
    console.log(pc.dim('  No new matches in this run.'));
  }
  console.log(`  ${displayPath(paths.matchLog)} ${pc.dim('(all matches)')}`);

  if (!opts.open) return;
  const file = written.at(-1) ?? (await latestDailyMarkdown());
  if (!file) return;
  const opened = await openFile(file);
  console.log(opened ? pc.dim(`  Opened ${displayPath(file)}`) : pc.yellow(`  Could not open ${file}; open it manually.`));
}
