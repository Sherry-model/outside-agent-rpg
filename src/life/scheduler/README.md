# Life scheduling · 0.12.0

First implementation batch. Product G reviewed the engine and save behavior; Astra completed the release browser checks, including Product G's long-file import fix. This does not supply the planned 90–130-scene full game. The existing first days remain the opening segment; later waiting can cross weeks or months. No real network, clock, task runner, employer or external service is used.

## Data and boundaries

- `events.json`: cognition-format scenes and outcomes. `schedule_return` is an internal return sentinel, never a new game ending.
- `manifest.json`: eligible initial encounters, their source IDs and narrative roles, declared transition windows, phase budgets, safe inbox nodes, choice time increments and causal promises. Ordinary reading/cognition do not create windows.
- `semantic.json` / `cues.json`: newly experienced content and neutral directory cues. The scheduler's permanent delivery log is not a source of forgotten original wording.
- `types.ts`, `engine.ts`: pure scheduling state, its own xorshift stream, budgets and obligations.
- `integration.ts`: suspends an already-settled original result before its destination arrives. Finishing the inserted scene applies the suspended transition exactly once. Multi-node inserted branches count each actual completed scene without generating more random quota.
- `ui.ts`: life plans, deadline preview, explicit inbox handling and grouped receipts. Calendar time advances only by commands; closing the page does nothing.

0.12 is selected for new runs. 0.11 config is frozen, all older graphs and command semantics remain versioned. New `wait` and `respond` commands and the complete schedule are replay-validated. Action and cognition RNG remain untouched by encounter selection.

## Deterministic rules

1. Per actual declared checkpoint: settle noninteractive receipts, then deliver at most one ready choice-bearing promise; only if none is ready consider a new encounter. The order is original response deadline, creation sequence, stable ID. A protected checkpoint performs no scene delivery or random draw.
2. A promise spends remaining local quota when available. If exhausted or expired, it increments `overdraft`; it is never dropped. Leaving a phase expires only unused quota. Returning to the same phase does not refill it. Pending obligations survive every phase change.
3. Due conditions require both world hours and actual completed scenes. Rendering, reading, compression, recall and result screens are not scenes. Core scenes are existing authored graph scenes, not all mainline; scheduled daily and branch counts are separate.
4. A forced continuous passage may delay delivery. In this first batch, all declared response windows are held until a safe opportunity: `advanceClock` extends an exceeded deadline and accumulates `deferredHours`. The UI discloses this on the pending item and delivered scene. This is not support for arbitrary irreversible real-calendar deadlines. Authors wanting an expiring crisis must supply a separate preflight design; do not silently reuse this grace policy.
5. A voluntary wait never grants that protection. Preview first: required choices crossing their deadline block the jump; missable items require exact ID acknowledgements of the authored consequence; ready summaries settle together. Then advance time, inject genuinely new receipts, and open at most one scene. An unavailable required choice can be approached via the nearest-due waiting option before its deadline; hard deadlines cannot also depend on unreached scene counts.
6. Explicit replies use the same ready queue order. Each non-summary promise requires a reachable fallback node, so leaving the original channel does not strand it. This batch's application is explicitly remote.
7. Explicit waiting is available only after the first days and at safe nodes before an ending, with Context below capacity. The first voluntary wait may offer one fresh encounter; subsequent waits deliver promises only. Longer waiting does not multiply random opportunities. Later authored phases may supply their own budget and checkpoints; this first small pool does not define full-game density.
8. Ending remains optional with unresolved matters. The final choice warns about them; no future success or employment is manufactured.

## Content coverage

| Source | Current nodes | Retained / deferred |
| --- | --- | --- |
| WORLD_EVENT_003 | chance_idle | Four ways to spend a free hour; achievement deferred |
| WORLD_EVENT_009 | chance_art | Noninstrumental art, description retained; full-image assets and achievement deferred |
| WORLD_EVENT_036 | chance_application | Missing employment category, four application choices; achievement/career system deferred |
| Original bridging content for 036 | response_application, response_interview, receipts | Review, appointment, withdrawal/missed deadline, written result; no job granted |

The external 234-ID coverage ledger also records partial existing implementations: LEGACY_EVT_039/084→pg_w01, 044→pg_w03, 046→pg_v02, 082→pg_v01. These are not five fully completed source records or five new events to write from scratch.

## Capacity and validation

0.12 permits 4096 Life commands, up to 8192 cognition history records and 8,000,000 JavaScript string code units of import text. These are defensive prototype bounds, not unlimited-history support. Old saves retain their original 500-command/2 MB boundaries. The history test, normal seed routes, capacity benchmark and browser evidence must remain distinct from independent acceptance.

Both Life UI shells import files through `importSaveFile`: a 24,000,000-byte pre-read limit covers the UTF-8 encoding upper bound for 8,000,000 UTF-16 code units. The parser still enforces the character limit and strict replay; legacy Life imports keep their original 2,000,000-byte UI limit. Formatted browser exports, not only compact JSON, must round-trip.

Run `npm test`, `npm run build`, `node --import tsx scripts/scheduler-browser-check.mjs`, and `node --import tsx scripts/life-import-browser-check.mjs`. Set `SCHEDULER_OUTPUT` or `IMPORT_OUTPUT` to retain evidence in a new directory. Browser evidence uses offline file URLs, both UI shells, three viewport widths, English/Chinese, real commands, export/import and console/network monitoring. Natural play and interruption-density evaluation remain distinct from fixture-based regression checks.
