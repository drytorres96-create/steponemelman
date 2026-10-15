# Accepted answers and daily study routes

Category: coach, neurocognition/ADHD, web design, adversarial review.

A free-text answer could match a declared synonym locally and then be downgraded by
AI. MyQBank also displayed a partial grade as “Incorrect”. Both study players now
retain accepted local answers without an AI request; the Worker independently checks
the trusted, version-matched source before invoking the model or its cache. For other
wordings the model receives the complete accepted-answer alternatives, and grading
cache keys include evaluator version 2.5.1 and those alternatives. The free budget,
authentication, source gates and question identity checks remain in force.

Version 2.5.1 records the evaluator revision required before releasing corrected
editorial assessments. It retains the matching algorithm. Saved blocks keep their
original questions and attempts retain their recorded evaluator versions; a newer
source cannot recheck an attempt from a different question version.

MyQBank distinguishes “Partially correct”, identifies AI grading and persists its short
reason in optional attempt metadata. “Recheck accepted answer” appears only when a
previous AI grade contradicts an exact accepted answer in the saved presentation.
The explicit correction updates the same attempt, preserving its text, time, assistance,
original AI reason and identity. Conflicting answers, changed question versions and
manual corrections are not automatically regraded. Historical attempts remain unchanged
until the user chooses the action; there is no database rewrite or corpus edit.

For concepts with a text or numeric input, both feedback and teaching display an
“Expected answer” card with literal source wording. Free-text alternatives are shown
as individually accepted answers, with duplicate spellings removed. It supports
highlighting, hides again for recall and stays hidden in Test until block completion.
No clinical answers are generated or changed.

The daily “Review due items” and “Study today's new items” actions now open persistent
MyQBank Tutor blocks. Selection, due ordering, study-day rules and daily limits still
come from the existing scheduler. A block uses the current 80-item maximum; any
remaining items stay in the daily schedule. Incorrect answers use the existing block
review/practice-again flow, not the legacy automatic reinsertion queue. Explicitly
resuming a pre-MyQBank session retains its original identity and now has a scrollable
container so its footer remains reachable.

Principle: give specific feedback without making an accepted response fail unpredictably,
and retain a consistent workspace for the next study action. Correct-with-help remains
assisted practice, not independent mastery.

## Validation

- `npm ci`, production TypeScript/Vite build.
- Full unit suite plus focused provenance checks; two intentional skips and historical study/NBME compatibility.
- 30 MyQBank browser regressions passed. They cover accepted answers despite an adverse AI response, partial
  feedback and reason after reload, Tutor/Test visibility, explicit historical recheck,
  due selection, navigation through long content at 390/1280px, and resume persistence.
- Synthetic screenshots: before/after feedback at 390 and 1280px; both final themes. No private corpus or
  user progress is included. Desktop stays within the viewport; panels scroll internally.
- Adversarial review: client-supplied synonyms cannot influence server acceptance;
  source revisions are checked before the fast path; corrections preserve help flags
  and cannot duplicate attempts; due routes do not mutate legacy sessions.

Free-text answers outside the declared list can still require AI judgment; this change
prevents overriding known accepted answers, not every possible semantic grading error.
