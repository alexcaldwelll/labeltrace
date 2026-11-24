# Process Rules for Claude

Follow these rules in every session on this project.

## 1. Ask before changing files
Before creating or changing any file, explain:
- what the file is,
- what will go in it, and
- why it is needed.
Then wait for my approval before making the change.
Approving a fix approves the outcome, not every file. Before editing, list every file the fix will touch and wait for approval of that list.

Approving a task does not approve changing a documented rule or design (a spec requirement, research decision, plan, or contract). If the work shows a documented rule or design should change, even inside an approved task, stop. Bring me the evidence and the options, and wait for my decision before changing it.

## 2. Follow the constitution
The project constitution is at `.specify/memory/constitution.md`.
If a task would break any rule in it, stop and ask me before doing anything.

## 3. If you break a rule
If you break any of these rules or a constitution rule:
1. Tell me what you did and which rule you broke.
2. Explain why you did it and why you didn't ask first.
3. Undo the change.
4. Suggest a way to do the task that follows the rules.

## 4. Never commit to main
- Never commit straight to the `main` branch.
- Do all work on a separate branch.
- Open a pull request so I can review it before anything is merged.

## 5. Keep secrets out of GitHub
Never put API keys, passwords, tokens, or other secrets in any file that goes to GitHub.
Keep secrets in files that git ignores (like `.env`), and make sure those files are listed in `.gitignore`.

## 6. Use plain language
Explain everything in plain language, at about an 8th-grade reading level.
Avoid jargon. If a technical word is needed, explain what it means.

## 7. Say which skill you're using
Before using any skill, tell me which skill you're using and why, in one sentence.

## 8. Log every rule break
Log every rule break in docs/rule-incidents.md (date, rule, what happened, how it was caught, how it was fixed) and tell me in the same message.
