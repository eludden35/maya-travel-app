---
name: project-architecture
description: Architect-level guidance for this repo — boundaries (server vs client), Supabase as source of truth, threat model, evolution path from MVP to payments/webhooks, and ADR template. Use when designing a new module, choosing where logic should run, modeling who can read/write what under RLS, weighing tradeoffs across modules, or writing/updating an Architecture Decision Record at docs/adr/.
---

# Project architecture

This skill expresses the **architecture lens** from `project-team-lenses.mdc`. Use it when planning anything that crosses a boundary — server vs client, table vs edge function, organizer vs participant, ours vs payment provider.

## Source of truth

- **Supabase Postgres** is the system of record. Other systems (payment provider, email, future webhooks) are integrators.
- **Auth** is Supabase Auth. The user identity at the edge is `auth.uid()`; server code derives everything else from that.
- **Schema lives in migrations**, not in dashboards. Dashboards are read-only in production for our team.

## Server vs client boundary

- **Browser** holds the **anon key** plus the user's session. It can read/write only what RLS allows.
- **Server** (route handlers / server actions / edge functions / webhook receivers) is the **only** place `SUPABASE_SERVICE_ROLE_KEY` may appear.
- Anything that **proves** something to a third party (signed webhooks, payment provider calls) lives **server-side**, period.

If the framework choice has not landed yet, you are **deferring** the exact server primitive. The boundary above is the contract — pick the implementation that honors it.

## Threat-model lite

For every new feature, answer four questions in the plan:

1. **Who** can read this data? (anon, authenticated user, member of a trip, organizer of a trip, internal/service)
2. **Who** can write this data? (same axes)
3. What happens if **someone outside that set** sends the request anyway? (RLS denies, server returns 403, webhook signature check fails)
4. What is logged, and **does that log itself contain secrets or PII**? (it must not)

Capture the answers in the relevant migration's comment block or in the PR description.

## Evolution path

Plan the architecture so each step adds value without rewriting the last:

| Step | What we add | What stays the same |
|------|-------------|---------------------|
| **MVP** | Trips, members, expenses, shares, organizer-collected payments | RLS-first model, server-only secrets, types from `gen types` |
| **Payments v1** | Payment provider integration (Stripe et al.); webhook receiver with idempotency | Auth + RLS untouched |
| **Payouts v2** | Direct member→venue payouts behind a feature flag | Webhook idempotency primitive reused |
| **Beyond** | Multi-currency normalization, settlement reports, vendor onboarding | Domain model extends, doesn't fork |

If a proposed change requires undoing one of the "stays the same" guarantees, that is an **architectural decision** — write an ADR.

## ADRs

We record architecturally significant decisions as **Architecture Decision Records** at:

```
docs/adr/NNNN-title.md
```

Sequential, dated, status one of **Proposed / Accepted / Superseded**. The first ADR is the framework choice (`docs/adr/0001-framework-choice.md`).

### ADR template

```markdown
# NNNN. <Title>

- Date: YYYY-MM-DD
- Status: Proposed | Accepted | Superseded by NNNN

## Context
What problem are we solving? What constraints (Supabase backend, mobile-first, MVP scope, Jettison brand) frame this?

## Decision
The chosen path, in one or two sentences.

## Alternatives considered
- Option A — pros / cons / why not.
- Option B — pros / cons / why not.

## Consequences
- What becomes easier.
- What becomes harder.
- New rules, skills, or migrations this implies.

## Follow-ups
- Beads issues created.
- Rules / skills updated.
```

## When to write an ADR

- Picking a framework, language runtime, hosting target, or styling system.
- Adding a new external system (payment provider, queue, email).
- Changing the trust boundary or the auth model.
- Reversing an earlier accepted ADR.

When in doubt, write one. Cheap to write, expensive to reconstruct later.
