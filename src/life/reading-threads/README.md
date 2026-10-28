# Reading-driven branches — S1 / Life 0.14

S1 implements routing, not new released narrative. `profile.ts` has an **empty
production pool**. CAT/HUAC are unapproved story prototypes. Existing events,
including the historical A/B/C/D development batches, are candidates for later
reuse or rearrangement; their current organization is not a permanent rule.

## State and scheduling

- Only a successful Life `read` records `schedule.reading.opened[post]`, using
  the first `coreScenes` value. Rendering, bookmarks and rereads do not reset it.
  This is eligibility, never a source of character knowledge or exact quotations.
- A new entry needs one completed ordinary scene, an explicit public window,
  two ordinary scenes since a matching `themeNodes` event, enough phase budget,
  and space for the new observation **strictly below** capacity. Actual existing
  scheduled meetings can mark a theme without increasing ordinary scene counts.
- At most two first entries and one cross-window active reading line. Entry
  admission requires room for its longest route. `shown + reserved <= 5`;
  acceptance reserves the remaining maximum, delivery consumes one reservation,
  and an explicit end releases the rest. Refusal still counts as an entrance.
- The first reading entrance alone gets a conditional guarantee after two
  eligible misses. Quiet draws and ordinary encounters count. Blocked, empty,
  protected, occupied or due-response windows do not. The first entrance closes
  this guarantee permanently. Reading candidates are stably sorted and use the
  scheduler RNG; action dice are untouched. Waiting never draws new reading lines.
- Follow-ups use the existing commitment queue and phase overdraft, with the
  existing deadline/creation/ID order. S1 permits bounded, deterministic,
  single-scene steps returning to `schedule_return`; follow-ups require an
  explicit choice, positive waiting time, `afterScenes: 0`, no expiry, and a
  public/mail fallback. They do not roll again. Capacity can defer them while
  retaining the promise and its visible response entry.
- A final ending or resource exhaustion may leave commitments unfinished; it
  does not mark them delivered. Only declared free exits bypass capacity. The
  four 0.13 exits still work in 0.14. Original costs, cognition and automatic
  compression boundaries remain in force.

## Version and fixture isolation

0.13 config is frozen in `../releases/0.13.0.json`. Earlier versions keep their
original manifest, schedule state, RNG and content. New derived fields are
schema checked and rebuilt by strict replay. Tests fingerprint all thirteen
released content/config/story/reading combinations through 0.13.

`tests/fixtures/reading-profile.ts` contains a mechanical three-scene and a
two-scene line. `node scripts/test-reading-threads.mjs --preview` replaces only
the profile module in an isolated bundle. It runs real Life integration tests
and builds `output/reading-threads-20261026/TEST-ONLY-reading-threads.html`, using
the real application UI, not mock controls. A persistent test banner identifies
the preview. The fixture has a distinct profile identity and storage prefix;
production rejects its saves, and the preview does not read production autosaves.
Test stories are not imported by the production dependency graph.

The command also writes legally reached UI fixtures under `ui-fixtures/`.
They cover entrance, acceptance, current/lost evidence, refusal, both complete
lines, manual/automatic full-context exit, late promise, unfinished ending and
deferred response. These are engine evidence, not screenshots or natural play.

`npm test` includes the isolated integration suite. The runner explicitly clears
`NODE_TEST_CONTEXT` before invoking the nested Node test runner, so child tests
cannot silently be skipped. A later content batch must freeze the 0.14 empty
profile and introduce its own versioned profile/manifest rather than editing
the meaning of already-exported 0.14 runs.

Independent acceptance uses the committed SHA. Passing S1 does not certify
story quality, encounter density, natural play, or authorize publication.

## 0.15 publication extension

`profiles.ts` now selects a versioned profile; 0.14 retains its empty production
pool. `production-0.15.ts` is also empty: the first two public epilogues attach to
existing community choices, without adding a new reading-driven story. See
[`../publications/README.md`](../publications/README.md) for settlement,
visibility and the separate A → P → B integration fixture. Root post validation
uses the target version's complete library, not its initially visible entries.
The older S1 fixture explicitly disables the 0.15 publication profile so its
mechanical cat-root sample remains independent of production timeline edits.


## Browser build regression

The preview shares the production offline story-embedding plugin; direct esbuild
cannot execute Vite's `import.meta.glob` in a browser. Keep the fixture profile
replacement isolated, but do not omit the offline transforms.

After `node scripts/test-reading-threads.mjs --preview`, run
`node scripts/reading-preview-browser-check.mjs`. This offline Playwright smoke
check requires the actual generated HTML to start, accepts one real fixture
invitation, verifies the reserved follow-ups and storage isolation, then reloads.
Node integration tests alone do not cover browser initialization.

## S1 acceptance checkpoint (2026-10-27)

Implementation `d29b3db` was independently reviewed by Astra. Preview startup
fix `bf91960` was rechecked by Product G: shared transforms preserve embedded
story and frozen snapshots, all nine fixture integration checks and the build
pass, and production HTML is byte-identical. Product G reviewed Astra's browser
smoke evidence; it did not perform a new independent browser run. S1 is complete
within this scope. Production narrative remains empty pending S2 content work;
this checkpoint does not authorize a main merge or publication.
