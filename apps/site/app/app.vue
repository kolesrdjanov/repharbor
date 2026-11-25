<script setup lang="ts">
import { Button } from '@repharbor/ui/components/ui/button';

const signIn = new URL('/sign-in', useRuntimeConfig().public.appOrigin).href;
</script>

<template>
  <a href="#main-content" class="sr-only fixed top-4 left-4 z-50 rounded bg-card px-4 py-3 focus:not-sr-only">Skip to content</a>
  <header class="border-b bg-background">
    <div class="page-width flex min-h-18 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
      <NuxtLink to="/" class="flex items-center gap-2.5 rounded font-semibold tracking-tight">
        <span aria-hidden="true" class="grid size-9 place-items-center rounded-lg bg-foreground text-sm text-background">R</span>
        RepHarbor
      </NuxtLink>
      <nav aria-label="Primary" class="order-last flex basis-full flex-wrap items-center gap-x-5 gap-y-1 text-sm font-medium text-muted-foreground sm:order-none sm:basis-auto">
        <NuxtLink to="/for-sales-reps" class="inline-flex min-h-11 items-center hover:text-foreground">For sales reps</NuxtLink>
        <NuxtLink to="/integrations" class="inline-flex min-h-11 items-center hover:text-foreground">Integrations</NuxtLink>
        <NuxtLink to="/commission-example" class="inline-flex min-h-11 items-center hover:text-foreground">Commission example</NuxtLink>
      </nav>
      <Button as-child variant="outline"><NuxtLink :to="signIn" external>Sign in</NuxtLink></Button>
    </div>
  </header>
  <main id="main-content" tabindex="-1">
    <NuxtPage />
  </main>
  <footer class="border-t bg-card">
    <div class="page-width flex flex-wrap items-center justify-between gap-5 py-8 text-sm text-muted-foreground">
      <NuxtLink to="/" class="font-semibold text-foreground">RepHarbor</NuxtLink>
      <div class="flex flex-wrap gap-5">
        <NuxtLink to="/integrations">Revenue sources</NuxtLink>
        <NuxtLink to="/commission-example">How commissions work</NuxtLink>
      </div>
    </div>
  </footer>
</template>
