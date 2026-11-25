<script setup lang="ts">
import { Button } from '@repharbor/ui/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@repharbor/ui/components/ui/card';
import { providers } from '#shared/content';

usePublicPage('RepHarbor | Sales commissions for founders and reps',
  'Connect revenue sources, agree on commission terms, and give founders and independent sales reps one shared statement.', '/');

const signIn = new URL('/sign-in', useRuntimeConfig().public.appOrigin).href;
</script>

<template>
  <section class="page-width grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.08fr_0.92fr] lg:py-24">
    <div class="space-y-6">
      <h1 class="max-w-[13ch] text-5xl leading-[0.99] font-semibold tracking-[-0.058em] sm:text-6xl lg:text-7xl">A shared statement for sales commissions.</h1>
      <p class="max-w-lg text-lg leading-7 text-muted-foreground">Connect sales, agree on terms, and give founders and independent sales reps the same view of what was earned, paid, and due.</p>
      <div class="flex flex-wrap gap-3">
        <Button as-child size="lg"><NuxtLink :to="signIn" external>Open RepHarbor</NuxtLink></Button>
        <Button as-child size="lg" variant="outline"><NuxtLink to="/commission-example">See the commission example</NuxtLink></Button>
      </div>
    </div>
    <StatementExample />
  </section>

  <section class="border-y bg-card">
    <div class="page-width py-13 sm:py-16">
      <div class="grid gap-5 lg:grid-cols-[0.75fr_1.25fr]">
        <h2 class="max-w-xs text-3xl font-semibold tracking-tight sm:text-4xl">From an agreement to a payment record</h2>
        <dl class="grid gap-5 sm:grid-cols-3">
          <div class="border-t pt-3"><dt class="font-semibold">Agree on terms</dt><dd class="mt-2 text-sm leading-6 text-muted-foreground">Set a rate, eligibility window, and payment deadline for each product.</dd></div>
          <div class="border-t pt-3"><dt class="font-semibold">Link customer sales</dt><dd class="mt-2 text-sm leading-6 text-muted-foreground">Match approved claims to provider customers and check uncertain sales.</dd></div>
          <div class="border-t pt-3"><dt class="font-semibold">Record payments</dt><dd class="mt-2 text-sm leading-6 text-muted-foreground">Add payments already sent externally and trace how the shared balance changed.</dd></div>
        </dl>
      </div>
    </div>
  </section>

  <section class="page-width space-y-6 py-13 sm:py-16">
    <h2 class="text-3xl font-semibold tracking-tight sm:text-4xl">Connect your revenue source</h2>
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card v-for="provider in providers" :key="provider.slug" class="gap-2">
        <CardHeader><CardTitle><h3>{{ provider.name }}</h3></CardTitle></CardHeader>
        <CardContent class="space-y-3">
          <p class="text-sm leading-6 text-muted-foreground">{{ provider.summary }}</p>
          <NuxtLink :to="`/integrations/${provider.slug}`" class="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">About {{ provider.name }}</NuxtLink>
        </CardContent>
      </Card>
    </div>
  </section>
</template>
