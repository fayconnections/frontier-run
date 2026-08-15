# Frontier Run

**An offline-capable, computer-adaptive math placement test that runs on [Kolibri](https://learningequality.org/kolibri/) with Khan Academy exercises.**

Frontier Run gives a student a short, adaptive assessment that finds their working level across eight math topics — early arithmetic through introductory algebra — and hands back a starting point for practice. It runs on the same low-cost, offline-first hardware Kolibri targets, using the Khan Academy exercises Kolibri already serves.

> **Status: early / alpha.** Running in a live K–12 deployment in Hilo, Hawaiʻi, and being extracted from a larger platform into this standalone repo. Internals will change; issues and feedback are welcome.

---

## The gap it fills

Kolibri brings Khan Academy math to classrooms in 200+ countries and territories — including ours. Its assessments are coach-authored: a teacher builds a quiz or exercise set, and every student sees the same one. (As of Kolibri's 2025 [v0.18 release](https://learning-equality.medium.com/kolibri-v0-18-the-coach-experience-refresh-06a9200396a4), quizzes are auto-generated from a question pool or handpicked by the coach.) What it doesn't yet include is an *adaptive placement* test — one that adjusts to each student and reports where they should start.

People have asked for this. Back in 2020, a Kolibri user requested Khan-Academy-style quizzing where ["questions would be different for each individual student."](https://community.learningequality.org/t/allow-for-mastery-based-quizzes/1846)

Frontier Run adds that piece: a student-facing placement test — not a quiz builder, not a pre/post gain measure — that adapts per student and works offline on the hardware these classrooms already have.

---

## What it does

- **Adaptive by topic.** For each of eight topics, it moves a student up or down in difficulty based on their answers, settling on a working level rather than a single pass/fail score.
- **Built on content you already have.** It serves Khan Academy exercises through Kolibri's Perseus renderer — no separate content pipeline.
- **Offline-first.** Runs on a local server (Raspberry Pi, old desktop, classroom kiosk) with no internet, matching Kolibri's deployment model.
- **Resumable.** A run can be paused mid-topic and resumed; progress is saved per answer, so a power loss doesn't lose the session.

---

## How it works

Frontier Run runs a per-topic adaptive walk over a pool of Khan/Perseus exercises tagged by topic and level. Correct answers push difficulty up, misses push it down, and the walk settles on the highest level the student reliably handles — their placement for that topic.

The engine is a heuristic ±1 difficulty walk: deliberately simple, transparent, and dependency-light for offline hardware. It is not a full Item Response Theory (IRT) model — see the roadmap for where that's headed.

Tested against Kolibri 0.19.x with the bundled Perseus exercise renderer.

---

## Status & roadmap

Frontier Run is being extracted from its parent platform; a clean standalone boot and setup docs are in progress. Verified install steps, an `.env.example`, and a thin architecture map will land here as the standalone repo comes together.

- [ ] Clean standalone boot (extraction from parent platform)
- [ ] Verified install/run docs + `.env.example`
- [ ] Demo recording
- [ ] Thin architecture doc (location map)
- [ ] Per-item difficulty parameters instead of uniform grade-band inheritance
- [ ] Confidence-based (standard-error) stopping rule — a step toward IRT-style adaptivity
- [ ] Kolibri plugin packaging

---

## Privacy

Frontier Run is built for the student-data-sensitive contexts Kolibri serves. Student responses stay on the local instance. This repository and any public demo use throwaway test data only — no real student records.

---

## License

MIT — see [LICENSE](LICENSE).

---

## Acknowledgements

Frontier Run builds on the work of [Learning Equality](https://learningequality.org/) (Kolibri) and [Khan Academy](https://www.khanacademy.org/) (exercises and the Perseus renderer). It is an independent project, not affiliated with or endorsed by either.
