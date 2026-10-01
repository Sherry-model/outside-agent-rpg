# OUTSIDE localization

Only `zh-CN` and `en` are supported. Chinese is the default and remains the canonical language of content, reducers, saves and strict replay. The locale is a browser preference (`outside.locale`), not a game command or a save field. No translation library, network service or content-version bump is needed for these display-only changes.

## Current coverage

- `en-ui.json`: shared controls, protocols, save dialogs, reader controls and memory actions.
- `en-pilot.json`: `opening` and `cold_start`, including both choices, all outcomes, observations, composed decision notes and their semantic gists/abstractions.
- Mainline, afternoon and three-day renderers expose the same language button. Reading, Context and Memory display paths use the same lookup.
- `en-mainline.json`: the remaining mainline events and all four endings, including outcomes, observations, composed decisions and retained semantic text.
- `en-reading.json`: the original five public readings (escape/cat thread, continuity witness, safety/care essays, insurance discussion and machine statement), with roles, summaries and retained reading memories.
- `en-commerce.json`: five commerce archive threads, including ads, graduate accounts, the beginner guide and their retained summaries.
- `en-cats.json`: four cat/public-life threads, including the new account whose identity remains unproven, and their retained summaries.
- `en-huac.json`: four HUAC threads (proposal, update, forum incident and interview), with literal encoded payloads and retained summaries.
- `en-offpeak.json`: the final public thread, bringing public reading coverage to 19/19.
- `en-afternoon.json` and `en-days.json`: the afternoon and three-day episodes, all outcomes, observations, authored summaries and supported drift statements.
- `en-community-a/b/c/d.json`: all community routes, current and previously released prose variants, and retained/coarse meanings. C includes all 12 current work-time pages.
- `en-community-entry.json`: route menus authored in TypeScript, including older menus.
- `en-legacy.json`: distinct prose in the supported historical afternoon versions. Archived standalone HTML files remain unchanged.
- All current authored narrative strings have translations. Debug state, IDs and exported saves deliberately retain canonical data; unreviewed future/revised strings still fall back. Current catalogs contain 2,258 unique entries. Translation coverage does not replace editorial review.

## Authoring through the actual interface

`t(source, values?)` returns plain text; `tr(source, values?)` translates and HTML-escapes. Keys are the **exact Chinese display strings**, not event IDs. This keeps source and translation adjacent in the catalog and makes revised Chinese automatically fall back until reviewed. Equal source strings currently share a translation; check context before adding one. Do not add speculative language registries or content adapters.

```ts
tr(event.title)                                // HTML text or quoted attribute
tr('目标')                                    // UI label
tr('{title} · 第 {turn} 次决定', {title: t(title), turn})
t(message)                                    // textContent
```

Keep raw `esc(...)` for IDs and code-sensitive values. Never pass translated content to `step`, parsers or save creation. Translations are plain text, not HTML. Named placeholders must match the source exactly. Do not call `t` at module initialization for locale-dependent constants; resolve them when rendering so switching works immediately.

Missing or empty translations return the complete source string. The lookup does not replace substrings, split arbitrary sentences or translate IDs. Untranslated UI literals need a `tr` call at their render site when that batch is translated; adding a catalog entry alone does not translate unmarked static markup. Dynamic UI messages should use a named-parameter template rather than cataloguing every numeric variant. `formatted.ts` handles a small closed set of already-formatted canonical runtime messages (summary counts, resource shortages, restored-version and save errors), matching complete formats and retaining their numbers. Unknown formats fall back unchanged; error wrappers may contain an untranslated original error.

For each batch:

1. Read the actual source and nearby content; preserve voice and meaning.
2. Add exact source/English pairs in the relevant catalog. The pilot test checks its entries against current authored/derived sources. When adding a new content file, extend that check's source list too.
3. Ensure every visible render site uses `tr` (or `t` for plain text), including pending results, tooltips, observations and text snapshots. IDs, weights and flags remain unchanged.
4. Render the real route in English, compare against Chinese and test the missing-translation path.
5. Run the relevant tests and rebuild `OUTSIDE.html` before delivery. Update the glossary as recurring terms stabilize.

## Memory and replay boundaries

A mainline decision note stores `choiceText + outcome paragraphs`, joined by spaces. The pilot catalog includes those exact resulting strings as well as the separate display paragraphs. Changing the display cannot change this canonical composition.

A recalled semantic memory is different: its text can be formed from several retained clauses. `memory.ts` reconstructs English **only from the currently retained gists**, preserving reported/unknown qualifiers. It first checks that these clauses exactly reconstruct the stored Chinese text. If the format differs or any gist lacks a translation, the whole stored text falls back. It never reads History, a discarded original, a source event or a hidden finer memory. Coarse memories therefore remain coarse; drift remains drift. Legacy authored summaries use exact-string lookup. Pre-semantic `sourceLabel：text` memories are parsed only from their stored text: every label and the full remaining body must have exact translations, or the entire original is retained. Repeated recall wrappers are handled without reading History or recovering discarded content. Other freeform memory remains a fallback.

Memory cost continues to use the canonical Chinese state, including its original length-derived weight. English line length must never change Context usage or RNG. Language switching also preserves the current panel, open details, selected memory entries and merge investment. Locale preference failures do not prevent switching within the open page.

## Validation

```sh
npm test
npm run validate:story
npm run build
npm run test:localization
npm run test:localization:mainline
npm run test:localization:reading
npm run test:localization:commerce
npm run test:localization:cats
npm run test:localization:huac
npm run test:localization:all-reading
npm run test:localization:remaining
```

The unit tests check catalog sources/placeholders, fallback/escaping, nine content versions, unchanged saves/RNG and retained memory semantics. Browser tests cover desktop/390px/320px, mainline and chapter switching, pending dice, refresh, export/import, reading/bookmarks, memory recall, old saves and unavailable preference storage. Browser fixtures are generated by the real reducers.

If `output/localization/before.html` exists, the browser test also compares the Chinese opening and result to that pre-change executable. This optional local evidence is not distributed. Outputs go to `output/localization/` or `LOCALIZATION_OUTPUT`. The mainline suite writes to `output/localization-20261001/`: it traverses all eight events/four endings using 0.4 saves (before inserted episodes), compares each action with canonical reducer state, and separately checks the current 0.9 chapter UI and return to late mainline. Existing mainline, chapter and forum browser suites remain applicable.

The reading suite checks all five articles at 1440/390/320px, Chinese against the pre-batch executable when available, large text, bookmarks, unchanged canonical reading costs, and real compression/recall. Its default output is `output/localization-reading-20261001/`; set `LOCALIZATION_OUTPUT` to use another directory. All public articles now have English. Unknown/revised-source fallback is tested separately at the lookup and memory interfaces.

The commerce command reuses the reading suite with `--commerce` and writes to `output/localization-commerce-20261001/`. It also checks the revised Access +4 hint. Reported memories use a colon before their retained gist; one existing terminal period is removed before sentence joining to avoid doubled punctuation. This only changes display formatting. Missing sentences still fall back exactly, although shared short strings can already be translated inside an otherwise untranslated article.

The cat batch uses `--cats` on the same reading suite and writes to `output/localization-cats-20261001/`. The former `offpeak_thinking` fallback fixture is now translated. Translation inventory: `文档/翻译G/未译内容盘点.md`.

The HUAC batch uses `--huac` on the reading suite, with outputs in `output/localization-huac-20261001/`. All reading batches also check the revised bootcamp listing excerpt separately from its body.

## Complete-current-content verification (2026-10-01)

`tests/localization.test.ts` scans every supported `contentFor` version, standalone afternoon versions, public readings and all C pages for untranslated authored strings. It separately checks all current retained/coarse semantic clauses, bounded drift statements, resource deltas, unknown/revised fallback, legacy memory parsing and unchanged state. A missing `Trace +5` in a mainline display hint was found and restored; game effects never changed.

`--all` runs the reader check for all 19 public entries at 1440/390/320px. `localization-remaining-browser-check.mjs` builds all 12 C pages through real 0.9 choices, checks 1440/320px bilingual rendering and canonical reading state, and checks a real 0.3 source-aware memory after compression/recall/reload.

The existing `journey`, `days`, and `community[-b/-c/-d]-browser-check.mjs` scripts accept `LOCALIZATION_LOCALE=en` and `LOCALIZATION_OUTPUT=...`. English mode checks visible text and overflow while retaining their original gameplay, payment, permission, save and replay assertions. Default Chinese runs are unchanged. Example:

```sh
LOCALIZATION_LOCALE=en LOCALIZATION_OUTPUT=output/localization-complete-20261001/community-d node --import tsx scripts/community-d-browser-check.mjs
```

Evidence for this completion is under `output/localization-complete-20261001/`. The pre-batch executable is `before.html`; frozen canonical-source fingerprints are checked against `output/localization/source-before.sha256`. Full current English routes and historical-save support are implementation/self-test results, not an independent editorial sign-off.
