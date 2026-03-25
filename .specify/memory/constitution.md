<!--
Sync Impact Report
- Version change: template -> 1.0.0
- Modified principles:
  - [PRINCIPLE_1_NAME] -> I. Security and Privacy by Default
  - [PRINCIPLE_2_NAME] -> II. Contract-First Interfaces
  - [PRINCIPLE_3_NAME] -> III. Testable Delivery Gates
  - [PRINCIPLE_4_NAME] -> IV. Observability and Operability
  - [PRINCIPLE_5_NAME] -> V. Keep It Small and Reversible
- Added sections:
  - Engineering Standards
  - Delivery Workflow
- Removed sections:
  - None
- Templates requiring updates:
  - ✅ updated: .specify/templates/plan-template.md
  - ✅ updated: .specify/templates/spec-template.md
  - ✅ updated: .specify/templates/tasks-template.md
  - ⚠ pending: .specify/templates/commands/*.md (directory not present in repository)
  - ⚠ pending: README.md (not present in repository)
- Follow-up TODOs:
  - None
-->
# Swiss Constitution

## Core Principles

### I. Security and Privacy by Default
All user data handling MUST assume hostile networks and untrusted clients. Sensitive
content MUST be encrypted in transit, validated on input, and never logged in plaintext.
Security and privacy requirements are release-blocking criteria, not optional hardening.
Rationale: this project handles shared content and mistakes are irreversible once exposed.

### II. Contract-First Interfaces
Every externally visible API or integration MUST have an explicit contract before
implementation changes are merged. Contract changes MUST include compatibility analysis,
migration notes, and updated consumers where required.
Rationale: monolith and API services evolve independently and require stable boundaries.

### III. Testable Delivery Gates
Each user story MUST define independent acceptance scenarios that can be validated in
isolation. High-risk paths (security, auth, paste/share lifecycle, and data integrity)
MUST include automated tests before release. A change is incomplete until verification
steps are documented and runnable.
Rationale: independent validation prevents regressions in a mixed frontend/backend repo.

### IV. Observability and Operability
Production-impacting code MUST emit actionable logs/metrics/traces that explain failures
without exposing secrets. New operational behaviors (timeouts, retries, background jobs,
cache behavior, cleanup policies) MUST include monitoring and rollback guidance.
Rationale: operability determines mean time to recovery during incidents.

### V. Keep It Small and Reversible
Design and implementation SHOULD prefer the smallest change that satisfies acceptance
criteria and can be rolled back safely. Large refactors MUST be split into staged,
reviewable increments with explicit risk controls.
Rationale: incremental delivery improves reliability and review quality.

## Engineering Standards

- Plans MUST document technical context, constraints, and constitution gates before design.
- Specs MUST use measurable functional requirements and measurable success criteria.
- Tasks MUST map to user stories and include explicit paths and validation steps.
- Any intentional constitution violation MUST be recorded in a complexity/risk table with
  rationale and a simpler alternative that was rejected.
- Generated placeholders in spec artifacts MUST be replaced before implementation starts.

## Delivery Workflow

1. Define and validate scope with a spec that includes edge cases and acceptance scenarios.
2. Produce a plan with constitution check gates and architecture decisions.
3. Generate tasks organized by user story and independent testability.
4. Implement in small increments, validating tests and runtime behavior continuously.
5. Review for security/privacy, contracts, observability, and rollback readiness before merge.

## Governance

This constitution supersedes conflicting local development habits for this repository.
Amendments require: (a) explicit rationale, (b) updates to dependent templates/docs,
and (c) semantic version increment according to policy below.

Versioning policy:
- MAJOR: removals or redefinitions that invalidate prior governance expectations.
- MINOR: new principle/section or materially expanded mandatory guidance.
- PATCH: clarifications, wording improvements, and non-semantic refinements.

Compliance review expectations:
- Every implementation plan MUST pass a constitution check before research/design proceeds.
- Every pull request SHOULD reference impacted principles and verification evidence.
- Non-compliance MUST be documented with owner, timeline, and remediation plan.

**Version**: 1.0.0 | **Ratified**: 2026-03-24 | **Last Amended**: 2026-03-24
