#!/usr/bin/env node
import { Command } from 'commander';
import pc from 'picocolors';
import { importCommand } from './cli/commands/import.js';
import { runCommand } from './cli/commands/run.js';

const program = new Command()
  .name('job-alert')
  .description('Watch Greenhouse, Lever and Ashby job boards and report jobs that match your keywords.');

program
  .command('import')
  .description('Build data/companies.json (ATS + board token per company) from a Notion CSV export')
  .argument('<file>', 'Notion database export (.csv)')
  .option('-o, --out <path>', 'output file (default: data/companies.json)')
  .action(importCommand);

program
  .command('run', { isDefault: true })
  .description('Ask for companies, keywords and interval, then scan on a schedule')
  .option('--no-prompt', 'reuse the saved settings in data/config.json without asking')
  .option('--once', 'run one scan and exit')
  .option('--no-open', 'do not open the result file on exit')
  .option('--clear', 'delete local search results (output/) before starting, without asking')
  .action(runCommand);

try {
  await program.parseAsync();
} catch (err) {
  if ((err as Error).name === 'ExitPromptError') process.exit(130); // Ctrl+C inside a prompt
  console.error(pc.red(`Error: ${(err as Error).message}`));
  process.exit(1);
}
