# Community A: work, handover, and different hours

Implemented in life content **0.6.1** (A first shipped in 0.6.0), on `codex/community-abcd`. This branch stays separate until A–D are accepted. B/C/D are not implemented. Existing 0.3/0.4/0.5 saves retain their original route and chapter-reading restrictions; cognition rules remain 0.4.0 and life-save format remains v1.

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

During 0.6 three-day play, the shared reading panel dispatches the existing life `read` command. Browsing is free, retained originals reopen without another command, and absent originals must be read again as new external input. A summary/directory/read log is not the original. New reads are blocked during pending results, at full Context, and at chapter completion. Reading does not advance the event, turn, or RNG.

Checks: `npm test`, `npm run test:community`, `npm run test:days`, `npm run test:forum`, and `npm run test:skill:community`. Browser checks write fixtures and replayable exports under `output/community-a/`; run `test:community` before the skill client. Product review and detailed acceptance notes remain in local `文档/产品G/`.
