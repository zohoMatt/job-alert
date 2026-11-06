import { checkbox, confirm, input, number, select } from '@inquirer/prompts';
import pc from 'picocolors';
import { addManualCompanies, parseTokenList } from '../companies/add-manual.js';
import { parseKeywords } from '../matching/keyword-matcher.js';
import { providers } from '../providers/registry.js';
import { MIN_INTERVAL_MINUTES, type RunConfig } from '../store/config-store.js';
import type { AtsId, Company } from '../types.js';

export interface PromptResult {
  config: RunConfig;
  /** Companies the user added in this session (not yet saved). */
  added: Company[];
}

/**
 * Interactive setup. Defaults come from the last saved config.
 *   1. scan interval
 *   2. companies to scan (from companies.json)
 *   3. extra companies: platform, then ids; repeats until "no more"
 *   4. keywords
 *   5. summary and "start?"
 * Returns null if the user does not confirm.
 */
export async function promptRunConfig(known: Company[], previous: RunConfig | null): Promise<PromptResult | null> {
  const intervalMinutes = await askInterval(previous);

  const selected = new Set(await askCompanies(known, previous));
  const added: Company[] = [];
  do {
    await askExtraCompanies([...known, ...added], selected, added);
    if (selected.size === 0) console.log(pc.red('  Select or add at least one company.'));
  } while (selected.size === 0);

  const keywords = await askKeywords(previous);

  const all = [...known, ...added];
  const chosen = all.filter((c) => selected.has(c.id));
  printSummary(intervalMinutes, chosen, keywords, added);
  if (!(await confirm({ message: 'Start scanning?', default: true }))) return null;

  return {
    config: { intervalMinutes, companyIds: chosen.map((c) => c.id), keywords },
    added,
  };
}

function askInterval(previous: RunConfig | null): Promise<number> {
  return number({
    message: `Scan interval in minutes (min ${MIN_INTERVAL_MINUTES})`,
    default: previous?.intervalMinutes ?? MIN_INTERVAL_MINUTES,
    min: MIN_INTERVAL_MINUTES,
    step: 1,
    required: true,
  });
}

async function askCompanies(known: Company[], previous: RunConfig | null): Promise<string[]> {
  if (known.length === 0) {
    console.log(pc.dim('  No companies in data/companies.json yet. Add some in the next step.'));
    return [];
  }
  const previousIds = new Set(previous?.companyIds ?? []);
  return checkbox({
    message: 'Companies to scan (space: toggle, a: all, enter: confirm)',
    pageSize: 20,
    loop: false,
    choices: known.map((c) => ({
      name: `${c.name.padEnd(22)} ${pc.dim(`${c.ats}/${c.token}`)}`,
      value: c.id,
      checked: previousIds.has(c.id),
    })),
  });
}

/** Repeats "platform -> ids" until the user picks "No more companies". */
async function askExtraCompanies(known: Company[], selected: Set<string>, added: Company[]): Promise<void> {
  for (;;) {
    const ats = await select<AtsId | null>({
      message: added.length ? 'Add more companies? Pick a platform' : 'Add companies not in the list? Pick a platform',
      choices: [
        { name: 'No more companies', value: null },
        ...providers.map((p) => ({ name: p.label, value: p.id })),
      ],
      default: null,
    });
    if (ats === null) return;

    const label = providers.find((p) => p.id === ats)!.label;
    const text = await input({
      message: `${label} board ids or board URLs, comma separated`,
      validate: (v) => parseTokenList(v).length > 0 || 'Enter at least one id.',
    });

    console.log(pc.dim('  Checking...'));
    for (const r of await addManualCompanies(ats, text, [...known, ...added])) {
      switch (r.status) {
        case 'added':
          added.push(r.company);
          selected.add(r.company.id);
          console.log(pc.green(`  + ${r.company.token} (${ats}) added`));
          break;
        case 'known':
          selected.add(r.company.id);
          console.log(`  = ${r.company.name} (${ats}/${r.company.token}) already in the list, selected`);
          break;
        case 'not-found':
          console.log(pc.red(`  x ${r.token}: no ${label} board with this id`));
          break;
        case 'invalid':
          console.log(pc.red(`  x ${r.input}: ${r.message}`));
          break;
        case 'error':
          console.log(pc.red(`  x ${r.token}: could not check (${r.message})`));
          break;
      }
    }
  }
}

async function askKeywords(previous: RunConfig | null): Promise<string[]> {
  const text = await input({
    message: 'Keywords, comma separated (all must appear; whole words; case-insensitive)',
    default: previous?.keywords.join(', '),
    validate: (v) => parseKeywords(v).length > 0 || 'Enter at least one keyword.',
  });
  return parseKeywords(text);
}

function printSummary(intervalMinutes: number, chosen: Company[], keywords: string[], added: Company[]): void {
  const addedIds = new Set(added.map((c) => c.id));
  console.log(pc.bold('\nSummary'));
  console.log(`  Interval : every ${intervalMinutes} min`);
  console.log(
    `  Companies: ${chosen.length} (${chosen.map((c) => (addedIds.has(c.id) ? pc.green(c.name) : c.name)).join(', ')})`,
  );
  if (added.length) console.log(pc.dim(`             ${added.length} new, saved to data/companies.json when you start`));
  console.log(`  Keywords : ${keywords.map((k) => pc.cyan(k)).join(' AND ')}\n`);
}
