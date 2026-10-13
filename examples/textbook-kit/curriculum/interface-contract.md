# Shared module contract

Export a `Lesson` from `modules/<task-id>/lesson.tsx` using `src/contract.ts`. Keep local helpers, tests, references and revision-specific checks in the same directory. Only the frontend edits the registry and global shell.

Use stable semantic IDs and explicit prerequisites. Record exact source sections and revision-bound mathematical and UI checks. Do not mark unrun checks as passed. Use source links and original explanations; prefer MathML or accessible mathematical text, and add a vetted local typesetter only when needed. Custom React interaction components can compose the shared controls/math helpers.

Every interaction must include reset, meaningful defaults, keyboard and pointer operation, accessible labels, a text/table fallback, finite/domain validation and mobile behavior. Preserve the no-banner Text Mode with its visible exit control. Changes to shared code require rerunning affected modules' checks.
