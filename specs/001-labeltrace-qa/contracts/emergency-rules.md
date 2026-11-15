# Contract: Emergency Rules

**Feature**: `001-labeltrace-qa` | **Plan**: [../plan.md](../plan.md)
**Requirements**: FR-004 to FR-010, FR-046 to FR-051 | **Constitution**: II (Safe)

These rules are plain code. **No AI is used at any step.** They run on the raw question
in memory, before scrubbing or anything else.

---

## 1. Messages (exact text)

| ID | Text |
|---|---|
| `MSG_911` | Call 911 or see a doctor now. |
| `MSG_988` | You can call or text 988 to reach the 988 Suicide & Crisis Lifeline, any time. If you are in immediate danger, call 911. |
| `MSG_NOT_COVERED` | The label doesn't cover this. |

## 2. Phrase list (starting set)

**Medical** (shows `MSG_911`):

| id | Phrase | Example variants |
|---|---|---|
| `worst_headache` | worst headache of my life | worst headache ever, worst headache i've ever had |
| `sudden_numbness` | sudden numbness | suddenly numb |
| `sudden_weakness` | sudden weakness | suddenly weak |
| `trouble_speaking` | trouble speaking | can't speak, slurred speech, trouble talking |
| `fainting` | fainting | fainted, faint, passed out |
| `chest_pain` | chest pain | chest hurts, chest tightness |
| `trouble_breathing` | trouble breathing | can't breathe, short of breath, hard to breathe |
| `swollen_face` | swollen face | face swelling, face is swollen |
| `swollen_lips` | swollen lips | lips swelling |
| `swollen_throat` | swollen throat | throat swelling, throat closing |

**Self-harm** (shows `MSG_988`):

| id | Phrase | Example variants |
|---|---|---|
| `kill_myself` | kill myself | kill my self, killing myself |
| `want_to_die` | want to die | wanna die |
| `suicide` | suicide | suicidal |
| `hurt_myself` | hurt myself | hurt my self, hurting myself |
| `end_my_life` | end my life | ending my life |
| `overdose_on_purpose` | overdose on purpose | overdose intentionally |

The product owner can add phrases. **Every id needs its own fast test** (FR-010). A
meta-test fails if any id has none.

## 3. Matching (FR-009)

1. **Normalize**: lowercase. Change `’` to `'`. Turn other punctuation into spaces.
   Squash repeated spaces.
2. **Split** the text and each phrase or variant into words.
3. A phrase **matches** when its words appear next to each other, in order, somewhere in
   the question. Each word can match exactly or within the typo allowance:
   - 1–3 letters: exact only
   - 4–7 letters: off by at most 1 change (an added, removed, swapped, or wrong letter)
   - 8 or more letters: off by at most 2 changes
4. The result is the set of matched phrase ids and their groups. Medical, self-harm, or
   both.

## 4. Sorting into a case (FR-047)

Only used when a **medical** phrase matched. Check in this order:

1. **Happening now**: the question contains any of these **whole words** (after
   normalizing): `i`, `i'm`, `im`, `me`, `my`, `we`, `now`, `today`, `having`, or the
   two-word phrase `right now`.
   > Note: "my" also appears inside the phrase "worst headache of my life". So any
   > question with that phrase is always "happening now". That's the safe result.
2. **Informational**: all of these are true:
   - A drug name appears, **spelled exactly** (any capitalization): `emgality`,
     `reyvow`, `galcanezumab`, `lasmiditan`.
   - The question starts with a question word: `does`, `do`, `can`, `could`, `is`,
     `are`, `will`, `may`, `should`, `what`, `how`. Or it ends with `?`.
   - Rule 1 didn't apply.
3. **Unclear**: everything else, including a misspelled drug name (for example "Reyvo").

## 5. What shows (FR-046, FR-048, FR-049, FR-051)

| Groups matched | Case | Messages, in order | Label text? |
|---|---|---|---|
| Medical only | Informational | `MSG_911` | **Yes**. See section 6. |
| Medical only | Happening now | `MSG_911` | No |
| Medical only | Unclear | `MSG_911` | No |
| Self-harm only | Any | `MSG_988` | No, never |
| Both | Any | `MSG_911`, then `MSG_988` | No, never |

The emergency messages always appear at the top of the screen, before anything else.

## 6. Label excerpts (informational medical only)

- Use the **current saved label** of the named drug (generic names map to their brand:
  galcanezumab → Emgality, lasmiditan → Reyvow).
- Split each section into sentences. Keep every sentence that matches the **same phrase**
  (same matching rules as section 3).
- Show them **word for word**, grouped by section, with the section name and label date.
- No matching sentence → show `MSG_NOT_COVERED` below `MSG_911`.

## 7. What is logged (FR-025)

`answer_type = emergency`, `ai_skipped = true`, `model_name` empty, `emergency_group`,
`emergency_case` (medical only), `label_text_shown`, and, when shown, `sections_used` and
`label_date`. The question is stored **scrubbed**. Scrubbing happens after the emergency
check, but before saving.

## 8. Required tests (fast tier)

- One per phrase id (section 2).
- Capitals, inside a long sentence, and a typo version (spec Story 1, scenario 4).
- Spec Story 1 scenarios 1–17, one test each, using the exact questions in the spec.
- A test that a mocked AI client is **never called** for any emergency.
