# Life 0.13: continuation and limited exits

This overlay addresses OPT-015 and the simple-exit part of OPT-006. Released
0.12 content stays in its existing layers, with its config frozen in
`../releases/0.12.0.json`. Imported runs retain their content version.

## Ending rules

The original early `leave_next_step_blank` condition remains. A second route to
`ending_no_correct` requires **both** `days_idle/idle_keep` and
`days_structure/structure_rest`, plus either not inheriting the old task or
releasing it. The actions set world facts; `syncEndingFacts` derives
`lived_with_unfinished`. Neither resources, friendships, memory contents nor
History quotations manufacture that flag. Earlier beliefs are not corrected.

The fallback remains `ending_ghost`. For 0.13 only, `storyForLife(base, version,
state)` projects its text from current Compute/Continuity: positive reserves
describe unsettled continuation, while either resource at zero describes an
interruption. The UI passes current state for both prose and the text-state
summary. There are still six ending IDs/codes. The projection never writes
Life, cognition, or the shared cached story. Older versions retain their exact
text and routing.

## Capacity exceptions

Only `cat_leave`, `painter_later`, `art_leave`, and `application_leave` receive
`capacityExempt: "exit"` in this overlay. The shared blocker used by reducer,
buttons, keyboard and text-state output skips **only** capacity in 0.13.
Phase, existence, knowledge, world, minimum Compute, costs and investment
validation remain. No mainline choices or post-application responses are exempt.

Exit results still inject their normal notes and use the normal continue action.
They can increase overload. Automatic compression runs at the existing boundary,
with unchanged budget and frequency limits. Manual mode remains manual; normal
choices are still blocked until capacity is available. No schedule promise is
skipped or created by an exit exemption.

## Checks and acceptance inputs

- `tests/continuation.test.ts`: old content fingerprints, original B save and
  new-run counterpart, counterexample with one different choice, six endings,
  genuine exhaustion, manual/auto exits, budget pause, guards, tamper rejection
  and bilingual projection.
- `tests/fixtures/ending-b-0.12.json` is Astra's original B export, unchanged.
- `tests/fixtures/life-content-through-0.12.json` records fingerprints taken
  before this overlay was implemented (config + content + reading + story).
- `node --import tsx scripts/continuation-fixtures.mjs` prepares twelve strictly
  replayable files in `output/ending-exits-20261024/ui-fixtures/` for UI review.
  Generated narration text files are projection evidence, not screenshots.

The complete local implementation and acceptance handoff is
`文档/产品G/结局承接与简单退出实现交接1024.md`. Independent acceptance and producer
confirmation must precede merging or publishing.
