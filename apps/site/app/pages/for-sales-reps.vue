<script setup lang="ts">
import { Button } from '@/components/ui/button';

usePublicPage('For independent sales reps | RepHarbor',
  'Track your engagements, approved customer claims, commission entries, and recorded external payments.', '/for-sales-reps');

const signIn = new URL('/sign-in', useRuntimeConfig().public.appOrigin).href;
</script>

<template>
  <div class="page-width grid gap-10 py-14 sm:py-20 lg:grid-cols-[0.9fr_1.1fr]">
    <div class="space-y-5">
      <h1 class="max-w-[15ch] text-5xl font-semibold tracking-tight sm:text-6xl">Your commission agreements in one portfolio</h1>
      <p class="max-w-lg text-lg leading-7 text-muted-foreground">Keep your engagements with different companies together. Each company sees its own engagements and the statements you share.</p>
      <Button as-child size="lg" class="min-h-12"><NuxtLink :to="signIn" external>Open your portfolio</NuxtLink></Button>
    </div>
    <div class="divide-y border-y bg-card px-5 sm:px-8">
      <section class="py-6">
        <h2 class="text-2xl font-semibold tracking-tight">Review the terms</h2>
        <p class="mt-2 leading-7 text-muted-foreground">See what qualifies, when the eligibility window ends, and when commissions are due. Accept the specific version you agreed to.</p>
      </section>
      <section class="py-6">
        <h2 class="text-2xl font-semibold tracking-tight">Follow customer claims</h2>
        <p class="mt-2 leading-7 text-muted-foreground">Register a customer, check whether the founder approved the claim, and see the explanation if it was declined.</p>
      </section>
      <section class="py-6">
        <h2 class="text-2xl font-semibold tracking-tight">Trace a statement</h2>
        <p class="mt-2 leading-7 text-muted-foreground">Open each commission, adjustment, or external payment record and see how it affected the balance.</p>
        <NuxtLink to="/commission-example" class="mt-3 inline-flex min-h-11 items-center font-medium underline underline-offset-4">See the worked example</NuxtLink>
      </section>
    </div>
  </div>
</template>
