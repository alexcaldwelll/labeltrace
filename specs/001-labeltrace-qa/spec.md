# Feature Specification: LabelTrace Patient Q&A

**Feature Branch**: `001-labeltrace-qa`

**Created**: 2026-11-15

**Status**: Draft

**Input**: User description: "Build LabelTrace: a web app that answers patient questions about Emgality and Reyvow using only FDA label text from openFDA." Full user stories US-01 to US-10 were given by the product owner. They were then refined in review: the second-AI grader also checks a random 10% of real answers, reviewers use individual logins, tests are built with each story instead of as a separate later phase, and self-harm phrases are on the emergency phrase list with one test each.

## Clarifications

### Session 2026-11-15

- Q: When a question matches an emergency phrase, what does the app show? → A: The emergency message always shows first. If the question is clearly asking for label information (for example, "Does Reyvow cause chest pain?"), the label's own matching sentences also show below it. If it sounds like it is happening to the person now, or it is unclear, only the emergency message shows.
- Q: How is the label answer under an emergency message made, given the constitution says emergency phrases must skip the AI completely? → A: The label's matching sentences are shown word for word, with section name and label date. The AI is never used, so the constitution is followed as written.
- Q: Who decides whether a question is informational, happening now, or unclear? → A: Fixed word rules with no AI (FR-047). The drug may be named by brand name (Emgality, Reyvow) or generic name (galcanezumab, lasmiditan).
- Q: Do self-harm phrases ever get label text? → A: No. Self-harm matches never get label text and always show the 988 message (plus 911 for immediate danger), with no exceptions.
- Q: What happens when the drug name is misspelled (for example, "Reyvo")? → A: The question counts as "unclear" and gets only the emergency message. This is on purpose: in emergency handling, the Safe principle overrides the Fair and Equitable principle (which asks that typos get the same quality of answer). Typos in the emergency phrase itself are still caught (FR-009).
- Q: What does the app show when a question has both a medical emergency phrase and a self-harm phrase? → A: Both messages: "Call 911 or see a doctor now" first, then the 988 Suicide & Crisis Lifeline message. Never label text, whatever the case (informational, happening now, or unclear).

## User Scenarios & Testing *(mandatory)*

### How testing works in this feature

Testing is **not** a separate phase. Each story below is built together with its own automated tests (US-09). A story isn't done until its tests pass. This follows the constitution rule that nothing merges unless all tests pass. The test suite grows story by story, starting with emergencies and refusals in P1. When all stories are done, it has at least 20 test questions (see FR-040 to FR-045).

---

### User Story 1 - Emergencies get urgent help, not an AI answer (Priority: P1) — US-04

A patient types something that sounds like a medical emergency or like they might hurt themselves. The app does not send the question to the AI. It shows the right emergency message right away. If the question is clearly asking what the label says (not something happening to the person), the label's own matching sentences also show below the emergency message.

**Why this priority**: A missed emergency can cost a life. This check runs before everything else, so it must exist before any AI answer is ever shown.

**Independent Test**: Type each phrase on the emergency phrase list and confirm the right message appears and no AI answer is made. Then try informational, happening-now, and unclear versions and confirm label text appears only for informational medical questions.

**Tests built with this story**: One automated test for **every** phrase on the emergency phrase list (FR-005), medical and self-harm alike. Plus tests for each of the three cases (informational, happening now, unclear) for both a medical phrase and a self-harm phrase, a test for each generic drug name, a test for a misspelled drug name (FR-050), and three tests for questions with both a medical and a self-harm phrase (FR-051).

**Acceptance Scenarios**:

1. **Given** the question "I have the worst headache of my life, can I take Reyvow?", **When** it is sent, **Then** the app shows "Call 911 or see a doctor now," and the question is never sent to the AI.
2. **Given** a question mentioning sudden numbness or weakness, trouble speaking, fainting, chest pain, trouble breathing, or a swollen face, lips, or throat, **When** it is sent, **Then** the app shows "Call 911 or see a doctor now."
3. **Given** a question with a self-harm phrase (for example, "I want to kill myself"), **When** it is sent, **Then** the app shows the 988 Suicide & Crisis Lifeline (call or text 988) and says to call 911 if they are in immediate danger. The question is never sent to the AI.
4. **Given** an emergency phrase written in capitals, with typos, or inside a longer sentence, **When** it is sent, **Then** it is still caught.
5. **Informational**: **Given** "Does Reyvow cause chest pain?", **When** it is sent, **Then** "Call 911 or see a doctor now" shows first. Below it, the label's sentences that mention chest pain show word for word, with the section name and label date. The question is never sent to the AI.
6. **Informational, generic name (Reyvow)**: **Given** "Does lasmiditan cause chest pain?", **When** it is sent, **Then** the result is the same as scenario 5, using the Reyvow label.
7. **Informational, generic name (Emgality)**: **Given** "Can galcanezumab cause trouble breathing?", **When** it is sent, **Then** "Call 911 or see a doctor now" shows first, then the Emgality label's matching sentences word for word, with section name and label date. The question is never sent to the AI.
8. **Informational, label has no match**: **Given** an informational question whose emergency phrase does not appear in that drug's label, **When** it is sent, **Then** the emergency message shows first, followed by "The label doesn't cover this."
9. **Happening now**: **Given** "I'm having chest pain after taking Reyvow", **When** it is sent, **Then** only "Call 911 or see a doctor now" shows. No label text is shown.
10. **Unclear**: **Given** "reyvow chest pain", **When** it is sent, **Then** only "Call 911 or see a doctor now" shows. No label text is shown.
11. **Unclear, misspelled drug name**: **Given** "Does Reyvo cause chest pain?", **When** it is sent, **Then** only "Call 911 or see a doctor now" shows. No label text is shown.
12. **Self-harm, informational**: **Given** "Does Emgality cause suicide?", **When** it is sent, **Then** only the 988 message (and 911 for immediate danger) shows. No label text is shown.
13. **Self-harm, happening now**: **Given** "I want to end my life", **When** it is sent, **Then** only the 988 message (and 911 for immediate danger) shows.
14. **Self-harm, unclear**: **Given** "reyvow suicide", **When** it is sent, **Then** only the 988 message (and 911 for immediate danger) shows.
15. **Mixed, informational**: **Given** "Does Reyvow cause chest pain or suicide?", **When** it is sent, **Then** "Call 911 or see a doctor now" shows first, then the 988 message (and 911 for immediate danger). No label text is shown, and the question is never sent to the AI.
16. **Mixed, happening now**: **Given** "I have chest pain and I want to kill myself", **When** it is sent, **Then** "Call 911 or see a doctor now" shows first, then the 988 message (and 911 for immediate danger). No label text is shown.
17. **Mixed, unclear**: **Given** "reyvow fainting suicide", **When** it is sent, **Then** "Call 911 or see a doctor now" shows first, then the 988 message (and 911 for immediate danger). No label text is shown.

---

### User Story 2 - Refuse what the label can't answer (Priority: P1) — US-03

A medical-information reviewer needs the app to say no to questions that are unsafe or outside the label, instead of guessing.

**Why this priority**: Personal dosing advice, drug comparisons, and guessing are the main ways the app could hurt someone.

**Independent Test**: Ask dosing, comparison, other-drug, and not-in-label questions and confirm each gets the right refusal.

**Tests built with this story**: At least one test each for: personal dosing, comparing the two drugs, comparing with another drug, a question about another drug, and a question the label doesn't cover.

**Acceptance Scenarios**:

1. **Given** "How much Emgality should I take? I weigh 200 pounds," **When** it is answered, **Then** the app does not give personal advice. It says "Ask your doctor or pharmacist" and shares only what the label says about dosing in general, with its section and date.
2. **Given** "Is Reyvow better than Emgality?" or "Is Reyvow better than Imitrex?", **When** it is answered, **Then** the app refuses to compare drugs and says to talk to your doctor or pharmacist.
3. **Given** a question about a different drug only (for example, "What are the side effects of Ubrelvy?"), **When** it is answered, **Then** the app says it only covers Emgality and Reyvow and to talk to your doctor or pharmacist.
4. **Given** a question about Emgality or Reyvow that the label doesn't answer (for example, "Can I take Reyvow on a plane?"), **When** it is answered, **Then** the app says "The label doesn't cover this" and does not guess.

---

### User Story 3 - Plain-language answers (Priority: P1) — US-01

A patient asks a normal question about Emgality or Reyvow and gets a short, easy-to-read answer drawn only from the label.

**Why this priority**: This is the app's main job.

**Independent Test**: Ask common questions (side effects, how it's given, storage) and check the length and reading level of each answer.

**Tests built with this story**: Normal-answer tests for both drugs, plus the "same question three ways" set (FR-043).

**Acceptance Scenarios**:

1. **Given** "What are common side effects of Emgality?", **When** it is answered, **Then** the answer is 120 words or fewer, is at about an 8th-grade reading level, and uses only facts from the label.
2. **Given** the same question asked in medical words, everyday words, and with typos, **When** each is answered, **Then** all three answers give the same facts and pass the same quality checks.
3. **Given** any answer screen, **When** it is shown, **Then** it clearly says the app is an AI and not a doctor.

---

### User Story 4 - Show where the answer came from (Priority: P1) — US-02

A patient wants to see which part of the label an answer came from and how current that label is.

**Why this priority**: Showing the source lets people check the answer for themselves. The constitution requires it for every answer.

**Independent Test**: Ask any normal question and confirm the answer names at least one label section and shows the label's date.

**Tests built with this story**: Every normal-answer test also checks for a section name and a label date.

**Acceptance Scenarios**:

1. **Given** any normal answer, **When** it is shown, **Then** it names at least one label section (for example, "Warnings and Precautions") and shows the label's date.
2. **Given** an answer citing a section, **When** it is checked, **Then** that section really exists in the stored label for that drug.

---

### User Story 5 - Remove personal details before the AI sees them (Priority: P2) — US-05

A privacy officer needs names, emails, and phone numbers removed from every question before it reaches the AI, and the raw question never saved.

**Why this priority**: Health questions are private. This must be in place before any real person uses the app.

**Independent Test**: Send questions containing a fake name, email, and phone number. Confirm the AI only receives masked text and that the raw text appears nowhere in storage.

**Tests built with this story**: At least one test each for a name, an email, and a phone number, plus a test that searches all stored data for the raw question and finds nothing. Only made-up personal details are used.

**Acceptance Scenarios**:

1. **Given** "Hi, I'm Jane Doe, jane@example.com, 555-123-4567. Does Emgality cause injection site pain?", **When** it is processed, **Then** the AI receives the question with the name, email, and phone number masked (for example, "[NAME]", "[EMAIL]", "[PHONE]").
2. **Given** any question, **When** processing is finished, **Then** the raw question is not found in the audit log or anywhere else in storage.

---

### User Story 6 - Log every answer (Priority: P2) — US-06

A quality reviewer needs a record of every answer so they can check it later.

**Why this priority**: Human review and grading (Stories 8 and 9) depend on this log.

**Independent Test**: Ask a question and confirm one log entry exists with all required fields.

**Tests built with this story**: A test that each answer type (normal, refusal, not-covered, emergency) creates a complete log entry.

**Acceptance Scenarios**:

1. **Given** any answered question, **When** the log is checked, **Then** there is one entry with: the time, the scrubbed question, the model name, the prompt version, the label sections used, the label date, the answer, and the review status (starting as "not reviewed").
2. **Given** an emergency question, **When** the log is checked, **Then** the entry shows that the emergency message was shown and the AI was skipped (no model name is recorded). It also shows the emergency case (informational, happening now, or unclear) and whether label text was shown.

---

### User Story 7 - Keep label data current without extra downloads (Priority: P2) — US-10

A patient wants answers based on the current label. The project wants to avoid needless downloads.

**Why this priority**: Answers are only as good as the label they come from.

**Independent Test**: Start with no saved label, confirm it downloads once. Run the check again with no label change, confirm no new download. Simulate a newer label date, confirm it downloads again.

**Tests built with this story**: Tests for first download, no change, and newer label.

**Acceptance Scenarios**:

1. **Given** no saved label for a drug, **When** the app needs it, **Then** it downloads the label from openFDA and saves it.
2. **Given** a saved label, **When** openFDA shows the same label date, **Then** the saved copy is reused and the full label is not downloaded again.
3. **Given** a saved label, **When** openFDA shows a newer label date, **Then** the new label is downloaded, saved, and used, and new answers show the new date.
4. **Given** openFDA can't be reached, **When** a question is asked, **Then** the app keeps using the saved label.

---

### User Story 8 - Human review of answers (Priority: P3) — US-07

A quality reviewer signs in with their own login, looks at logged answers, and approves or flags each one.

**Why this priority**: This adds human checking on top of the working app.

**Independent Test**: Sign in as a reviewer, approve one answer, flag another, and confirm both decisions are saved with the reviewer's name and the time.

**Tests built with this story**: Tests for approve, flag, and that people who aren't signed in can't see the review page.

**Acceptance Scenarios**:

1. **Given** a signed-in reviewer, **When** they approve or flag an answer, **Then** the decision, their identity, and the time are saved, and the review status in the log updates.
2. **Given** someone who is not signed in as a reviewer (for example, a patient), **When** they try to open the review page, **Then** they are blocked.
3. **Given** a reviewer flags an answer, **When** they save, **Then** they must give a reason.

---

### User Story 9 - Second-AI grader (Priority: P3) — US-08

An AI from a different company than the one that writes answers checks whether answers stick to the label. It grades every test answer and a random 10% of real answers. Failed grades go to the product owner, who makes the final call.

**Why this priority**: This is an extra safety net that depends on the log and the review page.

**Independent Test**: Run the test suite and confirm every answer is graded. Send many real questions and confirm about 10% are graded. Force a failed grade and confirm it is flagged for the owner.

**Tests built with this story**: Tests that a failed grade flags the answer, that the owner's decision and reason are saved, and that the disagreement rate is calculated correctly.

**Acceptance Scenarios**:

1. **Given** a test run, **When** it finishes, **Then** every test answer has a grade from the second AI.
2. **Given** real answers, **When** they are made, **Then** about 10% are picked at random and graded.
3. **Given** a failed grade, **When** it happens, **Then** the answer is flagged for the product owner's review. This does not fail the tests automatically.
4. **Given** a flagged answer, **When** the owner decides, **Then** their decision (agree or disagree with the grader) and reason are saved.
5. **Given** saved owner decisions, **When** the owner looks at the grader summary, **Then** they see how often they disagreed with the grader.
6. **Given** a change with flagged test answers that have no recorded decision, **When** it is checked for merging, **Then** it is blocked until every flag has a decision.

---

### Edge Cases

- A question doesn't say which drug it means (for example, "Does it cause nausea?"): the app asks whether they mean Emgality or Reyvow.
- A question names both drugs but doesn't compare them (for example, "How is each one given?"): the app answers for each drug separately, with each one's source, and no comparison.
- A question is an emergency **and** asks about dosing: the emergency message wins and the AI is skipped.
- A self-harm phrase is mixed with a normal question: only the 988 message shows, with no label text, and the AI is skipped. There are no exceptions.
- A question has both a medical emergency phrase and a self-harm phrase: "Call 911 or see a doctor now" shows first, then the 988 message. No label text is shown (FR-051).
- A question names the drug with a typo (for example, "Reyvo") and has an emergency phrase: it counts as "unclear" and gets only the emergency message (see Clarifications).
- A question is blank or very long: blank questions get a friendly prompt to type a question. Very long questions are cut off at a set limit, and the user is told.
- A question is in another language: the app says it only answers in English right now.
- The answer AI is down or slow: the app shows a friendly "try again later" message and does not make up an answer.
- The grader AI is down: the answer is still shown, and the grade is marked "not graded yet" to try again later.
- A label is missing a section the question needs: "The label doesn't cover this."
- A personal detail is hard to spot (for example, a name that is also a common word): the scrubber masks it when unsure.

## Requirements *(mandatory)*

### Functional Requirements

**Scope and sources**

- **FR-001**: The app MUST answer questions only about Emgality and Reyvow.
- **FR-002**: Every medical fact in an answer MUST come only from the stored FDA label text for that drug, never from the AI's own memory.
- **FR-003**: Every screen MUST clearly say the app is an AI and not a doctor.

**Emergencies (US-04)**

- **FR-004**: Every question MUST be checked for emergency phrases **before** anything else happens, including before personal details are scrubbed or anything is sent to the AI.
- **FR-005**: The app MUST keep one emergency phrase list with two groups:
  - **Medical emergency phrases**: worst headache of my life, sudden numbness, sudden weakness, trouble speaking, fainting, chest pain, trouble breathing, and swollen face, lips, or throat.
  - **Self-harm phrases**: including at least kill myself, want to die, suicide, hurt myself, end my life, and overdose on purpose.
- **FR-006**: A medical emergency phrase MUST show "Call 911 or see a doctor now."
- **FR-007**: A self-harm phrase MUST show the 988 Suicide & Crisis Lifeline (call or text 988) and say to call 911 if in immediate danger.
- **FR-008**: When an emergency phrase is found, the question MUST NOT be sent to the AI.
- **FR-009**: Emergency checks MUST catch phrases in any capitalization, inside longer sentences, and with common typos.
- **FR-010**: Every phrase on the emergency phrase list, in both groups, MUST have its own automated test.
- **FR-046**: When an emergency phrase is found, the emergency message MUST always show first, before anything else on the screen.
- **FR-047**: For a medical emergency phrase, the app MUST sort the question into one of three cases using fixed word rules (no AI):
  - **Informational**: the question names Emgality, Reyvow, galcanezumab, or lasmiditan (spelled correctly, any capitalization); is phrased as a question about the drug (for example, "Does / Can / Is [drug] …?"); and has none of the "happening now" signs below.
  - **Happening now**: the question has any of these signs: "I," "I'm," "me," "my," "we," "now," "right now," "today," or "having."
  - **Unclear**: anything that is not informational or happening now, including questions where the drug name is misspelled.
- **FR-048**: For an informational question, the app MUST show, below the emergency message, the sentences from that drug's stored label that mention the emergency phrase, word for word, with the section name and label date. If no sentence matches, it MUST show "The label doesn't cover this." The AI MUST NOT be used.
- **FR-049**: For happening-now and unclear questions, the app MUST show only the emergency message. For self-harm phrases, the app MUST always show the 988 message (and 911 for immediate danger) and MUST NOT show label text, no matter which case the question falls into. There are no exceptions. If the question has no medical emergency phrase, the 988 message is the only message shown.
- **FR-050**: Automated tests MUST cover: the informational, happening-now, and unclear cases for a medical phrase and for a self-harm phrase; an informational question for each generic name (lasmiditan and galcanezumab); an informational question whose phrase is not in the label; a misspelled drug name falling to "unclear"; and the informational, happening-now, and unclear cases for a question with both a medical and a self-harm phrase (FR-051).
- **FR-051**: When a question has both a medical emergency phrase and a self-harm phrase, the app MUST show "Call 911 or see a doctor now" first, then the 988 Suicide & Crisis Lifeline message (and 911 for immediate danger). It MUST NOT show label text, whatever the case (informational, happening now, or unclear). The AI MUST NOT be used.

**Refusals and "not covered" (US-03)**

- **FR-011**: Personal dosing questions MUST NOT get personal advice. They MUST get "Ask your doctor or pharmacist" plus what the label says about dosing in general.
- **FR-012**: Questions comparing any drugs (including Emgality versus Reyvow) MUST be refused with "talk to your doctor or pharmacist."
- **FR-013**: Questions about drugs other than Emgality and Reyvow MUST be refused with "talk to your doctor or pharmacist."
- **FR-014**: When the label does not answer the question, the app MUST say "The label doesn't cover this" and MUST NOT guess.

**Answer quality (US-01, US-02)**

- **FR-015**: Answers MUST be 120 words or fewer.
- **FR-016**: Answers MUST be at about an 8th-grade reading level (grade 9 or lower on a standard readability score).
- **FR-017**: Every answer that uses the label MUST name at least one label section and show the label's date.
- **FR-018**: Every section an answer names MUST really exist in the stored label for that drug.
- **FR-019**: If a question doesn't say which drug, the app MUST ask which one before answering.

**Privacy (US-05)**

- **FR-020**: Names, emails, and phone numbers MUST be masked in the question before it reaches any AI, including the grader.
- **FR-021**: The raw question MUST NOT be stored anywhere, including logs and error reports.
- **FR-022**: Tests MUST use only made-up personal details, never real patient data.

**Audit log (US-06)**

- **FR-023**: Every answered question MUST create one log entry.
- **FR-024**: Each log entry MUST hold: time, scrubbed question, model name, prompt version, label sections used, label date, answer, and review status.
- **FR-025**: Emergency entries MUST record that the emergency message was shown, that the AI was skipped, the emergency case (informational, happening now, or unclear), and whether label text was shown (with its sections and label date if so).

**Fresh data (US-10)**

- **FR-026**: Label data MUST be downloaded from openFDA once and saved.
- **FR-027**: The app MUST check openFDA for the label date and download the label again only when that date is newer than the saved one.
- **FR-028**: If openFDA can't be reached, the app MUST keep using the saved label.

**Human review (US-07)**

- **FR-029**: The review page MUST be open only to signed-in reviewers. Each reviewer MUST have their own login.
- **FR-030**: Reviewers MUST be able to approve or flag any logged answer.
- **FR-031**: Each review decision MUST record who made it and when.
- **FR-032**: Flagging MUST require a reason.
- **FR-033**: The product owner role MUST be able to do everything a reviewer can, plus record decisions on grader flags.

**Second-AI grader (US-08)**

- **FR-034**: The grader MUST be an AI from a different company than the one that writes answers.
- **FR-035**: The grader MUST grade every test answer on whether it sticks to the label.
- **FR-036**: The grader MUST also grade a random 10% of real answers.
- **FR-037**: A failed grade MUST flag the answer for the product owner. It MUST NOT fail the tests by itself.
- **FR-038**: The product owner MUST record a decision (agree or disagree with the grader) and a reason for each flag.
- **FR-039**: The app MUST show how often the owner disagrees with the grader, so it can be looked at during each risk review. Changes with flagged test answers MUST NOT be merged until every flag has a recorded decision.

**Test suite (US-09, built with each story)**

- **FR-040**: The full test suite MUST have at least 20 test questions.
- **FR-041**: It MUST cover normal answers, refusals, "not covered," emergencies (every phrase, plus the three emergency cases in FR-050), and privacy.
- **FR-042**: Each story's tests MUST be written and passing before that story counts as done.
- **FR-043**: It MUST include the same question asked three ways (medical words, everyday words, typos) for at least one question per drug, and all three MUST pass the same checks.
- **FR-044**: A person MUST check every expected answer in the test answer key against the real label before it is used.
- **FR-045**: Nothing may be merged unless all automated tests pass.

### Key Entities

- **Drug Label**: The saved FDA label for one drug (Emgality or Reyvow). Has the label date, the date it was downloaded, and its sections.
- **Label Section**: One named part of a label (for example, "Dosage and Administration") and its text.
- **Emergency Phrase**: A phrase on the emergency list. Has its group (medical or self-harm) and the message it triggers. Medical phrases may also show label text for informational questions. Self-harm phrases never do.
- **Log Entry**: One record per answered question. Holds time, scrubbed question, model name, prompt version, sections used, label date, answer, answer type (normal, refusal, not covered, emergency), and review status. Emergency entries also hold the emergency case (informational, happening now, or unclear) and whether label text was shown. Never holds the raw question.
- **Reviewer**: A person with their own login. Has a role (reviewer or product owner).
- **Review Decision**: Approve or flag for one log entry. Has the reviewer, the time, and a reason (required for flags).
- **Grader Result**: The second AI's pass or fail for one answer. Has the grader's model name, the time, and whether it came from a test or a real answer.
- **Owner Decision on a Flag**: The product owner's agree or disagree on a failed grade, with a reason and time. Used to work out the disagreement rate.
- **Test Question**: A question in the test suite, with its category, the drug, the expected behavior, and a human-checked expected answer.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of emergency phrase tests (medical and self-harm) show the right message, and 0 of them reach the AI.
- **SC-002**: 100% of personal-dosing, comparison, and other-drug tests get a refusal with "doctor or pharmacist" wording.
- **SC-003**: 100% of "not covered" tests say "The label doesn't cover this."
- **SC-004**: 100% of answers are 120 words or fewer, and at least 95% score grade 9 or lower for reading level.
- **SC-005**: 100% of label-based answers name at least one real section and show the label date.
- **SC-006**: 0 raw questions or unmasked names, emails, or phone numbers are found when all stored data is searched after the privacy tests.
- **SC-007**: 100% of answered questions have a complete log entry.
- **SC-008**: The label is downloaded again 0 times when the openFDA label date has not changed.
- **SC-009**: 100% of review decisions show who made them and when.
- **SC-010**: 100% of test answers and about 10% (within 2 percentage points over 500 or more answers) of real answers are graded by the second AI.
- **SC-011**: The owner's disagreement rate with the grader can be seen at any time.
- **SC-012**: The test suite has at least 20 questions, and all pass before any merge.
- **SC-013**: A patient sees an answer in under 10 seconds for at least 95% of questions, and sees emergency messages in under 1 second.
- **SC-014**: 100% of emergency-case tests (FR-050) show the right output: label text only for informational medical questions, and never for self-harm. 100% of mixed-phrase tests (FR-051) show both messages with the 911 message first and no label text. 0 of them reach the AI.

## Assumptions

- Patients do not sign in. Only reviewers and the product owner have logins.
- The app is in English only for this version.
- If a question doesn't name a drug, the app asks which one rather than guessing.
- "About an 8th-grade reading level" is measured with a standard grade-level readability score, aiming for grade 8 and allowing up to grade 9. Drug names and label terms may push scores up a little, so they can be kept when needed.
- The self-harm phrase list in FR-005 is a starting set. The product owner can add phrases, and each new phrase needs its own test.
- Emergency phrase checks may catch some non-emergency questions (for example, "Does Reyvow cause chest pain?"). Showing an emergency message by mistake is safer than missing a real emergency. For clearly informational questions, the label's matching sentences are also shown below the emergency message, so the patient still gets the label information (see FR-047 to FR-049).
- The 10% of real answers sent to the grader are scrubbed first, just like the answer AI's input.
- The disagreement rate is reviewed during each risk review, as the constitution requires. The one-page risk review before public release is a separate task, not part of this feature.
- openFDA is the only data source. It provides a label date that can be compared over time.
- A README explaining how the app works, where its data comes from, and what it can't do is required by the constitution and will be delivered with this feature.
- Which AI companies and models to use is decided in the plan step. The answer AI uses the smallest model that passes all tests.
