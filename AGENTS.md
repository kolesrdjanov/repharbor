# RepHarbor

Use English for code, commits, product copy, email, and documentation. Read [the product specification](docs/RepHarbor-V1.md) for roles and commission rules. For implementation, start with [the work queue](docs/implementation/README.md) and open the brief for your assigned task.

For web UI or client-side behavior, use the Chrome Modern Web Guidance skill at the start of the task and UI UX Pro Max for design and interaction decisions. Use monochrome shadcn-vue components. Authentication uses email magic links through Resend. Build the public Nuxt site in the final phase.

Audit every completed implementation phase. During active development, exercise slice acceptance examples manually. Introduce automated tests, lint rules and push verification for each stack only after its feature implementation is complete. Follow [phase audits and stack checks](docs/implementation/quality.md).

Before implementing a backend, database, HTTP, or UI slice, read the [technical design](docs/technical/README.md). Use its PostgreSQL model and OpenAPI operations for shared contracts.
