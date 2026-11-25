# Phase audits and stack checks

## At every phase boundary

The owner of each completed phase (0–7 in the work queue) audits the delivered change against its task briefs, product requirements, SQL model and OpenAPI operations as applicable. Do this once at the boundary, before declaring that phase complete. Tasks from another ready phase can continue in parallel.

1. Identify the task IDs and revision under review. Map each acceptance criterion to an implementation path and an observed result from exercising the normal entry point.
2. Inspect missing behavior, contract drift and regressions. Reproduce discrepancies with local data. Distinguish observed behavior, fixture evidence and outstanding external dependencies.
3. Fix discrepancies, repeat the affected scenario, and record the outcome in the phase handoff. Leave an unmet criterion open with its owner and next action. A phase is complete when its required criteria are satisfied.

During implementation, exercise the changed flow manually and keep the evidence. Defer writing or running automated test suites, lint rules, aggregate verify commands, commit hooks and push checks for an unfinished stack. A phase audit is a review of implementation and evidence; it does not trigger CI.

## When a stack reaches feature completion

Run the stack audit as soon as its final implementation slice lands. If a phase and a stack finish together, one audit can cover both scopes. The public website remains the final W7 deliverable.

| Stack | Completion boundary | Audit and regression coverage |
|---|---|---|
| Backend | All planned API, worker, Prisma migrations, four revenue adapters, reconciliation, ledger and platform billing backend slices are implemented. | Trace OpenAPI operations to handlers and tenant checks. Exercise single-use login, cross-company access, webhook replay, source overlap, partial refunds, external payment retries and the €230 balance using PostgreSQL. |
| Private frontend | All private app screens, including integrations, review, statements and founder billing, are wired to the API. | Trace routes to permissions and API operations. Exercise both roles, email sign-in, keyboard navigation, narrow screens, stale/error recovery and matching balances. |
| Public website | W7 pages and deployment configuration are implemented. | Review public HTML, canonical URLs, sitemap, integration coverage and the handoff to app sign-in. |

For each completed stack, fix audit findings, add its automated tests and lint rules, and provide **one stack-scoped verify command** that runs the applicable tests, lint, type checks and build. Run that command locally and fix failures before enabling it as a remote push check. Record the command, result and trigger paths in the handoff.

Trigger the check on changes to that stack, its consumed shared contracts and relevant workspace/build configuration. Documentation-only changes outside those inputs should skip it. A shared contract change runs checks for each **completed** consumer. Keep unfinished stacks outside the job. Run checks remotely on push so local commits and pushes remain lightweight. A failing job marks that revision as failed and requires a fix. Production provisioning and deployment retain their separate release steps.
