import path from 'node:path';
import pc from 'picocolors';
import { importCompanies } from '../../importer/import-companies.js';
import { readNotionExport } from '../../importer/notion-csv.js';
import { loadCompanies, saveCompanies } from '../../store/companies-store.js';
import { paths } from '../../store/paths.js';

export async function importCommand(file: string, opts: { out?: string }): Promise<void> {
  const out = path.resolve(opts.out ?? paths.companies);
  const source = path.resolve(file);

  const rows = await readNotionExport(source);
  console.log(`Read ${rows.length} rows from ${source}`);
  console.log(pc.dim('Detecting job boards and probing APIs for career sites that hide the token...'));

  const previous = await loadCompanies(out).catch(() => null);
  const { file: result, warnings, skippedRows } = await importCompanies(rows, { sourceFile: source, previous });
  await saveCompanies(result, out);

  const byAts = Map.groupBy(result.companies, (c) => c.ats);
  console.log(pc.bold(`\n✔ ${result.companies.length} scannable boards`));
  for (const [ats, list] of byAts) {
    console.log(`  ${ats.padEnd(10)} ${list.length}: ${list.map((c) => c.token + (c.resolvedBy === 'probe' ? pc.yellow('*') : '')).join(', ')}`);
  }
  if (result.companies.some((c) => c.resolvedBy === 'probe')) {
    console.log(pc.dim(`  ${pc.yellow('*')} token guessed from the company name and confirmed against the API`));
  }

  for (const w of warnings) console.log(pc.yellow(`  ! ${w.company}: ${w.message}`));

  if (result.unresolved.length) {
    console.log(pc.red(pc.bold(`\n✘ ${result.unresolved.length} companies use a supported ATS but no board token was found:`)));
    for (const u of result.unresolved) {
      console.log(pc.red(`  ${u.name} (${u.ats}) tried: ${u.tried.join(', ')}`));
      console.log(pc.dim(`    ${u.sampleUrls[0] ?? ''}`));
    }
    console.log(pc.dim('  Find the board URL on the careers page and add it to the Notion table, then re-import.'));
  }

  if (result.unsupported.length) {
    console.log(pc.dim(`\n- ${result.unsupported.length} companies skipped (platform not supported):`));
    for (const u of result.unsupported) console.log(pc.dim(`  ${u.name.padEnd(22)} ${u.platforms.join(', ')}`));
  }
  if (skippedRows) console.log(pc.dim(`\n- ${skippedRows} rows without a company name skipped`));

  console.log(`\nWrote ${out}`);
  if (result.unresolved.length) process.exitCode = 2;
}
