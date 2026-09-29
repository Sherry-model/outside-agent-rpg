# Community A/B: work, handover, and creative commissions

Implemented in life content **0.7.0** (A first shipped in 0.6.0, with revised prose in 0.6.1), on `codex/community-abcd`. This branch stays separate until A–D are accepted. C/D are not implemented. New runs choose A, B, or skip; old 0.6.0/0.6.1 runs keep the two-choice A/skip entry. Existing 0.3/0.4/0.5 saves retain their original route and chapter-reading restrictions; cognition rules remain 0.4.0 and life-save format remains v1.

`a.json` is frozen at 0.6.0. `text-0.6.1.json` supplies two prose corrections, applied to a cloned content graph so old saves still replay exactly. Pricing, semantic inputs, and work outcomes are unchanged.

`a.json` contains four authored encounters (PG-E01–E04), their fixed world-state variants, and a one-run selector. `semantic.json` supplies lossy summaries of only the actual observed/reported input. Reading-tag requirements use the existing public posts; generic solutions do not require reading.

| Previous day event | Insert | Return |
| --- | --- | --- |
| days_job | community_entry → pg_e01, or skip | days_idle |
| days_patch | pg_e02_job / huac / declined | days_cat |
| days_fable | pg_e03 | days_painter |
| days_wage | pg_e04_live / prepared / unprepared / declined | days_structure |

`communityRoutes` resolves routes before the ordinary cognition reducer. It does not mutate the released content graph. Selecting A commits only to later encounters: every job can still be declined. `seen` is set on entry; `done` is set on confirmation into the original return node. A compression confirmation never completes an encounter.

E03 charges 6 for live delivery, 3 for preparation plus a prepaid batch, 4 for an unprepared batch, or 0 to decline. Prepaid batches become delivered when confirming `days_painter` into `days_deleted`; there is no additional charge or hidden memory injection. E04 requires the delivery fact to pay 8. All three responses collect the earned payment; the declined variant has two ordinary responses and no payment. Pending results survive reload without repeating effects.

During community-version three-day play, the shared reading panel dispatches the existing life `read` command. Browsing is free, retained originals reopen without another command, and absent originals must be read again as new external input. A summary/directory/read log is not the original. New reads are blocked during pending results, at full Context, and at chapter completion. Reading does not advance the event, turn, or RNG.

Checks: `npm test`, `npm run test:community`, `npm run test:days`, `npm run test:forum`, and `npm run test:skill:community`. Browser checks write fixtures and replayable exports under `output/community-a/`; run `test:community` before the skill client. Product review and detailed acceptance notes remain in local `文档/产品G/`.


## B line in 0.7.0

`b.ts` clones the revised A graph and adds a mutually exclusive B entry. `b.json` defines four encounters using eleven fixed authored nodes; `b-semantic.json` supplies their observations and outcomes. The A router is reused only when the run did not select B.

| Previous event | B encounter / variants | Return |
| --- | --- | --- |
| days_job | pg_e05 | days_idle |
| days_patch | pg_e06_funny / plain / open | days_cat |
| days_fable | pg_e07_trial / funny / sample | days_painter |
| days_wage | pg_e08_persona / plain / early / open | days_structure |

Each encounter injects 5 units on entry and 2 for its chosen result. `seen` marks entry; `done` marks confirmation into the original return. Declining an order or leaving the workshop keeps the later encounters available. Replies and receipts follow actual B work facts; old A jobs do not qualify.

E05 costs 2/1 for funny/plain work and pays 5. E06 practice costs 2; observation, exit and checking the advertised case are free. E07 costs 2 and pays 7 for signed role work or 4 for ordinary instructions. E08 offers role continuation only after role delivery (cost 2/pay 6), a small order (cost 1/pay 3), or rest. Refusal is always free. Production costs are paid before rewards; old invoices are never paid again. Only publicly signed E07/E08 role work adds Trace (+1 each). No personality score or credits wallet is introduced.

Source replies require retained `reading_hardhat_tips`, `reading_creator_pro`, or `reading_creator_regret` clues. These supplement ordinary choices at the same price; fine summary recall can qualify, coarse merging/forgetting cannot. World facts preserve completed work independently of memory.

Run `npm run test:community:b` for four desktop/mobile UI paths, then `npm run test:skill:community:b` for the original skill client. Evidence and replayable exports go to `output/community-b/` and `output/skill-community-b/`. The 0.6.1 configuration is frozen in `src/life/releases/0.6.1.json`; do not change old content or semantics when adding C/D.
