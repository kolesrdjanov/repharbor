# Phase 7 · Public website

This audit covers W7 in the commit that introduced this file, after the local private release rehearsal and stack checks in `e8ea726` and `f84a593`.

| Acceptance criterion | Implementation | Local observation |
|---|---|---|
| Generate crawlable home, rep, integration and example pages | `apps/site/app/pages`, `apps/site/nuxt.config.ts` | Nuxt generated eight public pages. Chromium with JavaScript disabled loaded the main copy and links on every page. |
| Describe the real commission workflow and supported coverage | `apps/site/shared/content.ts`, `apps/site/app/components/StatementExample.vue` | The four provider pages explain mapping, refund, basis and history limits. The example shows EUR 400.00 accrued before refund, a EUR 150.00 external payment, a EUR 20.00 adjustment, and EUR 230.00 outstanding from synthetic records. |
| Expose public canonical metadata and crawler routes | `apps/site/app/composables/usePublicPage.ts`, `apps/site/server/routes` | Each page rendered one main heading, a unique description and the matching canonical URL. The sitemap contained exactly the eight public pages and the robots policy pointed to that sitemap. |
| Hand off to private sign-in | `apps/site/app/app.vue`, `apps/site/app/pages/index.vue` | The static output points to the configured production app sign-in URL. Following the corresponding button with the local app origin loaded the real private sign-in screen in Chromium. |
| Configure separate hosting | `apps/site/wrangler.toml`, `apps/app/wrangler.toml` | Generated static assets and validated both configurations as TOML. The public deployment remains pending approval. |

The website was built after the private application and local release rehearsal. The [operations runbook](../runbook.md) documents the build origins and Cloudflare output. The next release action is E6 external validation from [phase 6](phase-6.md). Obtain the pilot agreement and sandbox credentials before exercising live accounts.
