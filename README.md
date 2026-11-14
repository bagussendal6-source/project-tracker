# Project Tracker

A Mac app that reads the projects you've set aside and gives you a short, evidence-backed briefing on each one: what's built, what's left, whether it's worth continuing, and the next step.

It uses your existing Claude subscription through the `claude` CLI. No API key is needed.

## App

```bash
npm install
npm run dev      # desktop app with hot-reloading UI
npm start        # build, then run the desktop app
npm run ui       # UI only, in a browser, using sample analyses from out/
```

- `electron/`: main process (window, menu, IPC, analysis runs) and the project store, kept under `~/Library/Application Support/Project Tracker`.
- `app/`: React renderer. The design tokens are in `app/styles.css`: a warm paper/ink palette, one accent, and light/dark modes that follow the system.

## Command line

```bash
node src/cli.ts analyze ~/SomeProject            # scan + Claude analysis + markdown report
node src/cli.ts analyze ~/SomeProject --lang Indonesian
node src/cli.ts analyze ~/SomeProject --no-sessions   # don't read your Claude Code transcripts
node src/cli.ts scan ~/SomeProject               # deterministic scan only (no tokens)
node src/cli.ts render ~/SomeProject             # re-render report.md from the saved report.json
```

Requires Node ≥ 23.6 (it runs the TypeScript directly) and a logged-in `claude` CLI. Run `npm install` only if you want `npm run typecheck`.

Output goes to `out/<name>-<hash>/`:

| File | What |
|---|---|
| `fact-sheet.json` | Deterministic scan: tree, languages, git history, TODOs, docs, Claude session summaries |
| `report.json` | Structured analysis (schema in `src/ai/schema.ts`); a timestamped copy is kept per run |
| `report.md` | Human-readable briefing |
| `run.json` / `run.log` | Token usage, timing, and the raw Claude event stream |

## How it works

1. **Scan** (`src/scan/`): reads git, the file tree, `TODO`/`FIXME` markers, README/CLAUDE.md, manifests, and `~/.claude/projects/<encoded-path>/*.jsonl`. It works without git, using file times and session history for the timeline. No AI is involved, and it takes about a second.
2. **Analyze** (`src/ai/`): runs `claude -p` in the project folder with the fact sheet as input. Claude verifies claims by reading code, then returns JSON that matches the report schema.
   - Isolated: `--safe-mode --restricted --strict-mcp-config`, so your global CLAUDE.md, skills, MCP servers, and hooks aren't loaded, and neither are the project's own settings or hooks.
   - Read-only: `--tools Read,Glob,Grep`, confined to the project folder.
   - `--no-session-persistence`: the analysis doesn't add a transcript to the project's Claude history.
3. **Render** (`src/report/`): progress % is computed here, not by the model. It's the size-weighted feature completion measured against the inferred MVP charter (done = 1, partial = 0.5, stub = 0.15, planned = 0; S/M/L = 1/3/8).
