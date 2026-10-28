# Branch outcomes and public posts — Life 0.15

Only an explicitly registered branch choice can publish a fixed follow-up post.
Most events have no publication. The production profile currently maps the
three `pg_e07_* / pg_e07_persona` variants to `branch_persona_column`, and
`pg_e11 / pg_e11_reply` to `branch_registration_reply`. Both are short epilogues;
neither opens another production event. Their text records public actions and
responses already present in the existing outcomes, without private samples or
additional elapsed time.

## One fact, one settlement boundary

`profile.ts` is the single association table. `branches` registers existing
community nodes; reading-thread step ownership is also accepted. Main-story
choices do not call this handler. A branch must have a fixed ordinary outcome;
random choices and capacity-exempt exits cannot publish.

Life calls `publishChoice` only after a successful cognition `choose`, with the
pre-choice node and choice IDs. This covers both scheduled and unscheduled
branches. The cloned Life receives `mind.world.flags.relay_published_<post>` and
the same fact in the choice's cognition audit. A rejected command cannot change
the original Life. Pending results already contain the fact; `continue` does
not repeat it. No timer, notification, extra RNG draw, reading record, cognition
injection, resource reward or scheduler slot is added by publication.

Content validation rejects every authored key in the `relay_published_` range,
including false values and compression effects. Association settlement is the
only writer. Ordinary event result text and its existing Context cost still
apply. Strict command replay reconstructs the fact and rejects forged states.

## Content versus availability

`libraryFor(version)` is the complete library of that content version, including
unpublished posts. `readingEntries(life)` is the current visible collection.
Directory counts, sections, direct reads, retained selected articles and reread
sources use that collection; bookmarks do not grant availability. Result,
capacity and ending restrictions still govern opening a visible post.

Publishing is monotonic within a run; forgetting or finishing a branch never
retracts the post. Only actually reading it can qualify a later S1 branch.
Existing entry limits, scene reservations, ordinary progress, theme spacing and
accepted promises remain unchanged. Validation caps this batch at two publishing
branches/two posts and one optional successor, rejects cycles and chains deeper
than A → P → B. It does not prove textual causality; authors/reviewers must check
all choices sharing a post actually provide the same public facts.

0.15 statically hides `escape_cat`, `creator`, `continuity_witness` and
`safety_and_care`, and removes only `pg_e13_witness`. Unrelated `creator_*` posts
and the other three D responses remain. Early self-investigation, actual cat
adoption/fame, a general research replacement and insurance events are not part
of this batch. The existing twelve C-page variants are not migrated.

0.14 has a frozen config and empty production reading profile. Earlier content,
libraries, semantics, manifests and saves keep their original meaning; loading
an old save does not hide its cat posts or award new publications. All version
changes are explicit rather than upgrading a saved contentVersion.

## Reproducible checks

- `npm test`: production transitions, invalid sources, visibility, English and
  old-version fingerprints, plus the isolated integration suite below.
- `node scripts/test-publications.mjs --preview`: builds a separately named
  A(two scenes) → P → B(one scene) fixture using the real Life engine and UI,
  shared offline story/snapshot transforms, a visible test banner and separate
  storage keys. Production rejects its saves. It writes replay-valid fixtures
  under `output/publications-20261028/fixture-saves/`.
- `tests/publications.test.ts` also writes production before/result/after/read
  saves under `output/publications-20261028/ui-fixtures/`, including main-host
  published and unpublished states. Old read-and-compressed content is covered
  by `tests/fixtures/reading-empty-0.14.json`.

Budget exhaustion and illegal resource/tag/capacity checks include synthetic
unit boundaries; they are distinguished from the exported legal-route saves.
Node tests and rendered HTML strings are not visible-browser or natural-play
acceptance. Review the fixed commit and actual offline previews independently
before claiming those stages complete.
