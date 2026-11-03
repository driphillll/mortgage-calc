# Repayment Progress and Nginx Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task; steps use checkbox syntax.

**Goal:** Add paid/remaining repayment totals, yuan-to-wan hover hints, and reusable main-site Nginx configuration.

**Architecture:** Reuse the existing monthly schedule. Export pure progress helpers from the calculator, and let the results view select a completed-period boundary. Deployment configuration stays separate from public assets.

**Tech Stack:** Native HTML/CSS/JavaScript, Node.js built-in tests, Nginx, POSIX shell.

**Spec:** `docs/superpowers/specs/2026-11-03-repayment-progress-design.md`

## Global Constraints

- No build step or runtime dependencies; do not deploy to a server.
- Aggregate money in integer cents and include effective prepayments as principal.
- Default progress uses local today; month-only dates mean month-end; no start date means zero completed periods.
- Keep all original calculator behavior and advertising integration.

## Review Focus

- Zero paid periods and full payoff must partition the entire schedule exactly.
- Multiple prepayments, unused events, and changed rates must use effective schedule amounts.
- Date estimation must respect the due day, leap-month ends, future starts, and absent start dates.
- Manual period changes must update only the progress summary and reject invalid periods.
- HTTPS redirects must preserve ACME access, relative resources, and domain-root ads.txt.

## Task 1: Main-site deployment files

Files: create `deploy/nginx/{default.http.conf,default.https.conf,reload-nginx.sh,README.md}`; update deployment documentation.

- [x] Add HTTP bootstrap and HTTPS site configs matching the existing documented paths.
- [x] Add syntax-check-before-reload hook and document CD file boundaries and first-certificate procedure.
- [x] Review configuration and validate the renewal hook with available tooling; document unavailable real-server checks below.

## Task 2: Repayment progress calculations

Files: modify `src/calculator.js`, `tests/calculator.test.js`.

Interfaces: `summarizeRepayment(schedule, paidPeriods)` returns `paidPrincipal`, `paidInterest`, `paidTotal`, `remainingPrincipal`, `remainingInterest`, `remainingTotal`; `estimatePaidPeriods(schedule, today)` returns a completed-period count.

- [x] Add failing tests with literal expected totals for zero, partial, and full repayment, prepayments, and changed rates; add due-date estimation and invalid-period cases.
- [x] Run tests and confirm failures are caused by missing behavior (20 passing, 8 new failing).
- [x] Implement pure helpers with integer-cent aggregation; run the complete test suite (28 passing).

## Task 3: Results view and verification

Files: modify `index.html`, `src/app.js`, `styles.css`, `README.md`; update deployment asset documentation.

- [x] Add paid-period control and two parallel three-amount summaries, keeping existing loan totals and savings.
- [x] Wire automatic initialization and manual progress updates; apply amount hover titles to summaries and table cells.
- [x] Verify interactions in Edge, static resources, mobile layout, and all Node tests.
- [x] Review the complete diff and report validation limits without deploying or committing.

## Validation record

- All 28 Node tests pass; JavaScript syntax and `git diff --check` pass.
- Edge checks cover initial estimation, manual progress, six amount summaries, prepayments with changed rates, hover titles, invalid input recovery, today reset, and form-change invalidation; no JavaScript exceptions.
- Widths 320, 375, 390, 768, 1024 and 1440 have no horizontal page overflow. Desktop and mobile screenshots were inspected.
- Independent review found no Important/Critical issue. The suggested on-page estimate wording was made explicit.
- The LF renewal hook passes shell syntax validation. Executing it against a controlled Nginx command verifies check-before-reload and no reload after a failed check.
- Actual Nginx syntax/routing validation remains a deployment check: Nginx is not installed locally, and downloading the official binary was unavailable in this environment. Run `nginx -t` on the target server before reload as documented.
- Ruling: use the existing shared working directory and leave changes uncommitted for review; no server deployment or CI pipeline changes were requested.
