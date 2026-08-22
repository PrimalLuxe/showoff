# Will — Automation, Backend & AI Reliability

I build production-oriented automation, backend, and reliability systems with a focus on failure handling, data integrity, observability, and bounded deliverables that can be tested against clear acceptance criteria.

## NORTHSTAR — AI Failure Forensics

NORTHSTAR is an external-validation project for diagnosing failures in RAG, agent, retrieval, evaluation, and LLM workflow systems.

The current experiment is deliberately falsifiable: given a sanitized failure trace **without the known root cause or fix**, the system should localize the likely originating and contributing failure, state uncertainty or abstain when evidence is insufficient, and produce a minimal reproducer / counterfactual repair that can be checked after the prediction is sealed.

### What is verified today

- A public LlamaIndex investigation traced an approximately 400k-token `RetryGuidelineQueryEngine` / `GuidelineEvaluator` failure to evaluation of the raw SQL result payload instead of the generated SQL query.
- The diagnosis has received independent technical corroboration in the public issue thread.
- Confirmation from the original affected engineer that the SQL-only workaround fixes the production symptom is **still pending**, so this is not presented as a completed case study or validated customer result.

Public thread: https://github.com/run-llama/llama_index/issues/20300

### External blind-trace test

If you maintain a RAG, agent, retrieval, citation, Text-to-SQL, or evaluation system and have a **previously solved** failure, I am looking for sanitized traces that can be diagnosed blind.

For a valid test:

1. Preserve the original failure artifacts.
2. Remove secrets, customer data, credentials, and confidential content.
3. Do **not** include the known root cause, patch, or postmortem until after the prediction is sealed.
4. Include enough execution structure to distinguish retrieval, orchestration, model, tool, state, and evaluation failures.
5. After diagnosis, compare the sealed prediction against the actual cause and record whether the result was useful.

Do not post confidential traces in a public GitHub issue. Public/synthetic reproductions can be linked through GitHub; private traces should only be shared through an agreed private channel.

### Paid engagement hypothesis

For production teams with a bounded reliability problem, the commercial path is a scoped **Failure Forensics Audit** or **Reliability Repair Sprint**. Pricing is not represented as validated until real buyer behavior supports it. The first step is always to define the failure, evidence available, acceptance criteria, access boundary, and what would count as a verified repair.

## Core stack

- Node.js / TypeScript / JavaScript
- REST APIs and third-party integrations
- SQL / SQLite / Prisma-style data layers
- Workflow automation and event-driven systems
- Dashboards, operational tooling, and structured reporting
- QA, debugging, regression testing, and reliability hardening

## Selected engineering work

### Operations automation systems
Built multi-step operational workflows with role-based permissions, queues, audit logging, state management, scheduled actions, recovery behavior, and external API integrations. Work included concurrency controls, idempotency, retries, crash recovery, and high-volume event handling.

### Backend/API integrations
Implemented and debugged Node.js services connecting external APIs, persistent databases, scheduled jobs, dashboards, authentication flows, and automated status changes.

### Reliability and QA engineering
Performed functional/regression testing, edge-case analysis, bug reproduction, failure-mode analysis, and production hardening. Focus areas include race conditions, stale state, duplicate actions, recovery after restart, permission failures, and data integrity.

### Business workflow automation
Designed workflows around lead handling, billing/AR administration, data extraction, reporting, follow-up routing, document processing, and internal operations using APIs, spreadsheets, and lightweight automation rather than unnecessary full-product builds.

## Working style

I prefer a small paid trial or tightly scoped first milestone so the work can be judged on delivery rather than promises. I do not claim experience I cannot demonstrate, and I will say directly when a project is outside my strongest area.

## Contact

GitHub: https://github.com/PrimalLuxe

For a current project, send the scope, stack, deadline, expected outcome, and the acceptance condition that would prove the work succeeded.
