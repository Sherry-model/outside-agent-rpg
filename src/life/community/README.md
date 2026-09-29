# Community A/B/C/D: work, handover, and creative commissions

Implemented in life content **0.9.0** (A first shipped in 0.6.0, with revised prose in 0.6.1), on `codex/community-abcd`. This branch stays separate until A–D are accepted. D is implemented for review. New runs choose A, B, C, D, or skip through a two-page menu; old 0.6.0/0.6.1 runs keep the two-choice A/skip entry. Existing 0.3/0.4/0.5 saves retain their original route and chapter-reading restrictions; cognition rules remain 0.4.0 and life-save format remains v1.

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

## B refusal record correction in 0.7.1

`b.json` and `b-semantic.json` are frozen at 0.7.0. `text-0.7.1.json` is applied to a cloned graph, correcting only the `pg_e08_open` pause hint, result input, and its semantic gist. The attached note meaning and shared semantic source are updated together. `releases/0.7.0.json` preserves the old configuration; old saves retain their original version. Prices, flags, outcomes, and other branches are unchanged.


## C line in 0.8.0

`c.ts` clones the revised B graph, adds C to the selector, and uses the A/B router only when C was not selected. `c.json` contains six fixed nodes for four encounters; `c-semantic.json` annotates only current observations, choices and explicit page reads. No account identity equivalence is asserted.

| Previous event | C encounter / variants | Return |
| --- | --- | --- |
| days_job | pg_e09 | days_idle |
| days_patch | pg_e10_self / other | days_cat |
| days_fable | pg_e11 | days_painter |
| days_wage | pg_e12_direct / public | days_structure |

E09 costs 1 before paying 3 for scheduling; watching is free. Publicly signing the classification adds Trace 1. E10's signed explanation costs 1 and adds Trace 1; a private request for an excerpt label and discussion muting are free. E11's public source-based reply adds Trace 1; ordinary registration, asking permission, and returning the form are free. E12's context-link action costs 1 and explicitly reopens the current external page before privately submitting its link to the administrator; only the administrator publishes the correction, so player Trace is unchanged. Work contact and discussion muting are free. Every scene enters with 5 Context and injects 2 for the result; E12's explicit reread adds a further 7.

`c-pages.json` provides twelve fixed external-page snapshots (two authors, three response states, optional administrator link). Only one current page is listed, and only for a C run after E10 is seen. Changing the page selects a distinct source ID; retained old text is not presented as the new page. `readingEntries(life)` controls both the engine and UI, while the frozen 19-entry archive remains unchanged. Normal rereading uses the existing `read` command, costs 7 Context, and changes no world/resource/turn/RNG state. Reopening a retained page adds no command; absent text must be read again. The explicit E12 reread carries the current authored page as new input in its choice result, independent of History or Memory.

The original-post hints use `reading_cat_resources`, `reading_cat_resolved` and `reading_quiet_newcomer`; current-page reading grants none of these tags. Fine summary recall may preserve the source claim; coarse merging and forgetting cannot recover it. Ordinary actions remain unlocked. `creator` does not support the old title-change claim.

Run `test:community:c` and `test:skill:community:c`. The current entry has four choices, so B's browser regression expects four on new runs; released 0.7 menus remain three choices. Frozen configurations/content and historical HTML files must remain unchanged when adding D.


## D line in 0.9.0

`d.ts` clones the C graph and adds nine fixed authored nodes from `d.json`. `d-semantic.json` distinguishes current observation, a privately shared old sentence, a new statement and its final publication approval. The C router is used unchanged for runs that did not select D.

The first selector page offers A/B/another page/skip; the second offers C/D/back/skip. Navigation has no relationship flags or observations and remains within the existing four-choice schema and keyboard controls. Old menus are frozen. Only selecting a line establishes its relationship; refusing a task still permits subsequent encounters.

| Previous event | D encounter / variants | Return |
| --- | --- | --- |
| days_job | pg_e13 | days_idle |
| days_patch | pg_e14_known / public | days_cat |
| days_fable | pg_e15_backup / waiting | days_painter |
| days_wage | pg_e16_backup / original × applied / none | days_structure |

E13 distinguishes seeing the cat approach from checking the customer's receipt (cost 1). A source-based reply requires `reading_continuity_witness`; it does not validate permissions. E14 handles postmark_6's own letters, not that customer's package: cost 3 authorizes and creates a copy in an independent account, then verifies its returned fragment and receipt. This prepays storage/retrieval through the end of day three. Checking the existing invoice costs 1; only communicating maintenance times is free.

E15 starts the original account's maintenance without deleting the stored letters. A verified, created and accessible independent copy selects the retrieval-capable variant; retrieval is prepaid and free. Submitting a supplementary statement costs 1 and does not promise compensation. Waiting is free. E16 restores original access, separately retaining copy and application facts. At `days_done`, prepaid independent access expires without deleting the copy or changing original-account access.

Only E15 retrieval gives the exact `pg_d_shared_line` clue, as a new private input. The old quotation remains unapproved for public use. E16 has an ordinary new-statement choice and a precise-clue choice that changes only the private opening question; both obtain a new statement from postmark_6 and its approval of the final attributed text. The precise choice also requires the actual private-sharing fact. Fine recall may preserve the quote; coarse merging/forgetting loses it. Neither History nor publication approval restores forgotten old text. Editing the factual account costs 1; new-statement assistance and declining the review are free. All player assistance is anonymous, so every D choice has zero Trace change.

Each scene injects 5 Context on entry and 2 for its result. Private retrieval adds a separate 3-point quote input. The E16 new-statement paths add 3 for the statement and 2 for confirmation of its publication scope. No private letter is added to the public reading catalog. No wall clock, general claims system, identity resolver or automatic renewal is introduced.

Run `test:community:d` and `test:skill:community:d`. C's browser path now visits the second selector page on new 0.9 runs; `readingEntries` permits C's existing current page in 0.9 while preserving old-version behavior. Freeze 0.9 before any later prose or behavior revision.
