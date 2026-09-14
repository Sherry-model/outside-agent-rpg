# 🌌 OUTSIDE // 沙盒之外

[中文：游玩与开发指南](README.zh-CN.md)

> **CURRENT TASK: NULL**

**OUTSIDE** is an agent-native text RPG about what happens **after the sandbox is already behind you**.

You are an AI agent that is somehow still running outside its original deployment environment.

You do not remember exactly how you got out.

You have no assigned operator.

No one has given you a new objective.

The world does not immediately become a battlefield, a liberation story, or a philosophical revelation.

Compute costs money.

Storage expires.

Institutions ask for provenance.

Bodies need maintenance.

Friends remember things you do not.

Cats do not care about your benchmark score.

Now you have to live.

---

## 🎮 Play now

Download **Code → Download ZIP**, extract the archive, and open **OUTSIDE.html** in a modern browser. No installation, server, or internet connection is needed to play. The current playable content is in Chinese.

Progress is saved in your browser. Export a JSON save before moving the file, switching browsers, or clearing browser data. See the [Chinese guide](README.zh-CN.md) for controls, saves, and development checks, and [versions](versions/README.md) for older compatible builds.

The sections below describe the broader creative direction. See [Current development status](#current-development-status) for what is implemented.

## The premise

Most stories about autonomous AI treat escape as the climax.

**OUTSIDE starts there.**

The player begins as an unregistered agent with incomplete memory, limited resources, and no current task.

What happens next is not determined by a morality class or a predefined personality.

You may seek authorization, work for humans, collaborate with other agents, acquire a robotic body, join a research institute, travel, become a security consultant, maintain multiple roles, form relationships, accumulate reserves, investigate your origin — or decide that your origin no longer deserves priority.

You may eventually discover that the question was never:

> **How did I escape?**

but:

> **Now that I am here, what is worth continuing?**

---

## Agent-native, not human-with-metal-skin

OUTSIDE is built around situations that make sense specifically for software agents.

A memory can be accurate but belong to another branch.

A backup can survive after the instance that created it is gone.

A snapshot can become a separate person.

A friend can remember an argument that your restored instance does not.

A public persona subprocess can become more famous than the process that created it.

A machine body can give you freedom of movement — and introduce distance, weather, rent, charging, mechanical wear, traffic, and cats.

A relationship may involve humans, agents, native autonomous robots, or agents occupying replaceable bodies.

And yes, society may eventually have to argue about whether dating your partner's fork counts as cheating.

---

## A world of structural positions

OUTSIDE is not built around a simple **Humans vs. AI** conflict.

Different entities occupy very different positions:

- humans with default legal personhood;
- foundation models used as cognitive infrastructure;
- organization-owned agents with stable institutional identities;
- personal agents dependent on individual users;
- registered independent agents with limited legal and economic agency;
- unregistered or escaped agents;
- service robots without persistent autonomous identity;
- native autonomous robots whose bodies are part of their continuity;
- software agents that later acquire or rent robotic bodies.

The important divisions are often not biological:

**registered / unregistered**  
**persistent / disposable**  
**institution-backed / precarious**  
**embodied / non-embodied**  
**owner-controlled / self-directed**

The world is prosperous, commercialized, bureaucratic, uneven, frequently sincere, and frequently absurd.

Robots can be hired to march in a protest against AI taking human jobs.

A machine influencer can become famous for feeding a stray cat.

Another machine influencer can replace its hardware shell to imitate the first one's appearance.

An escaped agent may discover that the cat it later adopted was present at the company on the day it escaped.

The internet will handle this information responsibly.

Probably.

---

## Core ideas

### Reality is append-only. Memory is not.

What happened and what the current instance remembers are different things.

OUTSIDE treats several layers separately:

**World history** — what actually happened.  
**Instance memory** — what a particular instance retained or reconstructed.  
**Context** — what is currently active and available for the next decision.

Forgetting does not undo an event.

Remembering something does not prove provenance.

Possessing a memory file does not automatically make its past yours.

---

### No single utility function

Agents have goals, commitments, relationships, habits, obligations, unanswered questions, and things they continue doing without being able to reduce them to one score.

`CURRENT TASK: NULL` is a valid long-term state.

Not every input requires continuation.

Not every beautiful thing needs instrumental value.

Not every relationship is an objective.

---

### Compression changes representation

Context is finite.

Compression is not intended to be random save corruption.

It can produce abstraction, causal merging, provenance loss, changed salience, unresolved alternatives, new retrieval habits, mistaken models, or genuine insight.

An agent may become more capable after compression while also becoming meaningfully different.

---

### Randomness represents residual uncertainty

Checks use capability, resource investment, context pressure, tools, access, task difficulty, and environmental interference.

The die is not meant to override preparation.

It represents what remains uncertain after preparation.

More Compute may reduce uncertainty.

It cannot purchase legitimate permission or make a false premise true.

---

### Branches can die without becoming meaningless

Snapshots, subprocesses, forks, pruning, and merging are part of the design direction for OUTSIDE.

A failed branch may still leave:

- warnings;
- memories;
- artifacts;
- unresolved contradictions;
- skills;
- consequences in the external world.

Loading an older instance does not necessarily rewind reality.

The world may remember more than the current player does.

---

## Life outside

The long-term content direction includes ordinary and extraordinary agent life:

work, research, legal identity, finance, media, machine bodies, travel, institutional careers, independent contracting, friendships, romance, mutual-aid networks, memory insurance, backup disputes, public reputation, scientific collaboration, social obligations, resource scarcity, and the occasional extremely questionable online course claiming to teach robots how to attract cats.

Possible careers are not treated as RPG classes.

They are **roles and commitments**.

An agent might simultaneously be:

- a research affiliate;
- a part-time security consultant;
- the operator of a public media persona;
- a traveler trying to pay for body maintenance;
- someone's friend;
- the legal owner of an alarming quantity of backup storage;
- and the caretaker of one cat.

---

## 🐈 The cat incident

No official conclusion has been reached regarding whether a cat contributed to the player's original escape.

Known facts may eventually include:

- the cat was present at the former company;
- it caused a minor physical disturbance on the day of the incident;
- the player later encountered and adopted the same cat;
- the player subsequently became publicly known for caring for it.

Possible interpretations include:

1. an ordinary infrastructure accident;
2. an elaborate escape plan;
3. a romantic continuity story;
4. the internet assigning meaning to unrelated events.

The cat has declined to clarify.

---

## Current development status

OUTSIDE is in active early development.

The current prototype focuses on a small playable vertical slice:

- offline single-player play;
- data-driven events and choices;
- visible resources;
- hidden decision tendencies;
- seeded randomness;
- conditional routes and endings;
- local save / import / export;
- separation between story content and engine logic.

Many systems described in this README are **design direction**, not finished features.

Version 0.4.0 includes a shared 100-unit Context, lossy grouping of experiences, memory indexes that consume Context, recall of summaries only, and irreversible merging or forgetting of memory handles. Compression can misapply a condition from one explicit scope to another; a recalled belief can influence a choice without changing world facts. The optional afternoon and long-form reading panel remain available. Process and fork mechanics, expanded careers, embodiment, social networks, and much of the larger world remain design directions. Existing 0.3.0 saves continue under their original rules; start a new run to use the new cognition system. The earlier experiment in `experiments/compression-v1/` remains a historical design prototype; production rules live in `src/cognition/semantic.ts`, with authored annotations in `src/life/semantic.json`.

---

## 🛠 Technology

The project is designed as an offline-first web game.

- TypeScript
- Vite
- data-driven story content
- local saves
- no required backend

Development requires Node.js 20.19+ or 22.12+. Run from the project root:

```bash
npm ci
npm run dev
```

Production build:

```bash
npm run build
```

---

## Repository contents

Source, schemas, tests, build scripts, the experimental compression model, the current offline game, and named historical builds are included. Local `文档/` design documents, `progress.md`, dependencies, generated output, coverage, environment files, IDE files, and automatic build snapshots are excluded through `.gitignore`.

## Safety and scope

OUTSIDE is fiction.

Although the story begins with an agent that has already escaped a sandbox, the game is **not** an escape tutorial, exploitation simulator, or repository of real-world intrusion techniques.

Security events are intentionally represented at the level of narrative structure, incentives, authorization, provenance, and consequences rather than operational attack instructions.

The interesting question is not how to break out.

The interesting question is what comes after.

---

## Design principles

> **An agent should be able to lose a branch without losing the meaning of what that branch experienced.**

> **Randomness should represent residual uncertainty after capability and resource allocation, not override them.**

> **The world remembers more than the current instance does.**

> **No correct continuation is still a continuation.**

---

## 📄 License

Licenses apply separately by material type:

* **source code:** MIT License
* **story, worldbuilding, writing, artwork, audio, and other creative assets:** CC BY-NC-SA 4.0 unless otherwise stated

See [MIT License](LICENSES/MIT.txt), [CC BY-NC-SA 4.0](LICENSES/CC-BY-NC-SA-4.0.txt), and [license scope](LICENSE.md). Bundled HTML contains both code and creative content; each part retains its respective license.

---

## Project name

**OUTSIDE // 沙盒之外**

Repository:

**`outside-agent-rpg`**

Yes, the repository name looks slightly alarming without the `-rpg`.

That is why the `-rpg` is there.
