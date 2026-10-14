# Memory directory display metadata

These files are a read-only UI projection, outside story rules and canonical saves.

- `memory-cues.json` maps an exact retained `(facet, gist)` pair to a neutral Chinese/English topic cue. `guidance.ts` reads only the current `Memory.body`, takes at most two distinct cues, and falls back to title + stable code when a clause is unknown or revised. Keep cues topical; do not reveal a claim, verdict, omitted detail, exact quotation, or whether a memory is true. Coarse merged bodies show only a broad retrospective cue.
- `requirements.json` describes current `requiresTag` / `supportTag` semantics. `kind: belief` means an expressible belief, not certified truth. `topics` identifies broadly related retained summaries when no usable candidate exists. `readings` is an explicit public-edition mapping, not permission to retrieve History or deleted material. `recall-sources.ts` additionally checks current library access and the current edition's semantic tags.
- Candidate eligibility follows the existing recall command: retained body + retained tags. It never uses confidence, integrity, old source text, History, command logs, or provenance links as recoverable knowledge.
- Codes are injective encodings of existing Memory IDs. They are not dates or sequence numbers. Filtering, sorting, locale and navigation never mutate a save.

When adding/revising content, author neutral cues for new retained clauses and metadata for new gates; do not reuse an old cue after changing a clause unless it still accurately describes retained content. Add public mappings only where the accessible edition actually supplies the tag. `tests/memory-guidance.test.ts` checks coverage for life 0.11.0; update the explicit version when accepting a new release. Missing metadata must remain a safe fallback, not an inference from old data.

Validation:

```sh
node --import tsx --test tests/memory-guidance.test.ts
npm run build
node --import tsx scripts/memory-guidance-browser-check.mjs
```

The browser check creates replayable save fixtures and offline screenshots under `output/memory-guidance-20261014/`. Fixture generation uses real commands; it does not forge snapshot fields.
