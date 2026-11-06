# job-alert

Scans Greenhouse, Lever and Ashby job boards on an interval and reports new jobs that match your keywords.

## Setup

```bash
npm install
```

Requires Node.js 22+. Works on macOS, Windows and Linux.

## 1. Import companies from Notion

Export the Notion applications database as CSV, then:

```bash
npm run import -- "path/to/Tasks Tracker.csv"
```

This writes `data/companies.json`: one entry per company board (ATS, board token, API URL).
The Notion table is only used to discover which ATS each company uses and its board token.

- **Board URLs** (`job-boards.greenhouse.io/<token>/…`, `jobs.ashbyhq.com/<token>/…`, `jobs.lever.co/<token>/…`): token is read from the URL.
- **Career sites that hide the board** (`…?gh_jid=…`, `…?ashby_jid=…`): the token is guessed from the company name and site, then confirmed against the API (marked `*`).
- **Not found**: printed as an error with the tokens tried; no token is saved. Add the board URL to Notion and re-import.
- **Unsupported** (Workday, iCIMS, LinkedIn, …): listed and skipped.

Re-importing keeps entries in `companies.json` whose `source` is `manual`.

## 2. Run

```bash
npm start
```

You are asked, in order:

1. **Interval** in minutes (minimum 60)
2. **Companies** to scan: checkbox list from `companies.json`
3. **Extra companies**: pick a platform (Greenhouse / Lever / Ashby), then enter board ids or board URLs, comma separated. Each id is checked against the API right away. Repeats until you pick "No more companies".
4. **Keywords**, comma separated. Every keyword must appear (AND), as a whole word, case-insensitive, anywhere in the title, location, department or job description.
5. **Start scanning?** after a summary

Nothing is saved until you confirm. Then your answers go to `data/config.json` (defaults for next time), and extra companies are added to `data/companies.json` with `"source": "manual"`, so they appear in the list next time and survive re-imports. You can skip the Notion import entirely and add every company this way.

```bash
npm start -- --no-prompt   # reuse saved settings
npm start -- --once        # one scan, then exit
npm start -- --no-open     # do not open the result file on exit
```

Each scan prints its start time, end time and duration, then how long the program has been running and when the next scan is. New matches are printed as `company · title · URL`.

A status line at the bottom shows what the program is doing:

```
Searching · scan #3 · 12/44 companies · 4s · q: quit
Waiting · next scan at 15:05:00 (in 59m 12s) · s: scan now · q: quit
```

| Key | While waiting | While searching |
|---|---|---|
| `s` | Scan now. The next scheduled scan moves to one interval after this one. | Ignored (a message says so) |
| `q` or `Ctrl+C` | Quit | Quit after the current scan (press again to force) |

The status line and keys need an interactive terminal; with output piped to a file, only the log lines are written.

The result file paths are printed at startup and again on exit. On exit, the Markdown file written in this run (or else the most recent one) opens in your default app: `open` on macOS, `explorer.exe` on Windows, `xdg-open` on Linux. Use `--no-open` to turn this off; it is also skipped when output is piped.

## Output

| File | Content |
|---|---|
| `output/jobs-YYYY-MM-DD.md` | Human-readable. Newest scan on top, each job with link, location, salary, which keyword matched in which field, and the full description. |
| `output/matches.jsonl` | One JSON record per match, for tools. |

A job is **new** if its key is not in `output/matches.jsonl` yet. That file survives restarts; delete it to report everything again.

## Layout

```
src/
  index.ts              CLI (commander)
  cli/                  prompts and commands (import, run)
  importer/             Notion CSV -> companies.json (URL detection, token probing)
  companies/            add companies by platform + board id
  providers/            one file per ATS, behind the AtsProvider interface
  matching/             Matcher interface + KeywordMatcher
  core/                 scanner, scheduler, typed events, http, text helpers
  output/               console, status line and Markdown sinks (subscribe to engine events)
  store/                companies.json, config.json, matches.jsonl
tests/                  vitest
```

### Extension points

- **New ATS**: implement `AtsProvider` (`src/providers/types.ts`), add it to `providers/registry.ts`.
- **AI screening**: implement `Matcher` (`src/matching/types.ts`); it is async and returns `reason`/`score`.
- **UI**: subscribe to `EngineEmitter` events (`src/core/events.ts`), like the console, status and Markdown sinks do. The `state` event gives `searching` / `waiting` (with next scan time); `Scheduler.triggerNow()` starts a scan on demand.
- **User-added companies**: `src/companies/add-manual.ts` (used by the CLI prompt; reusable by a UI).

## Development

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run build
```
