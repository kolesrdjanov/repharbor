<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@repharbor/ui/components/ui/card';
import { providers } from '#shared/content';

usePublicPage('Revenue integrations | RepHarbor',
  'Compare commission tracking from Stripe, Dodo Payments, Whop, and RevenueCat, including refunds and coverage limits.', '/integrations');
</script>

<template>
  <div class="page-width space-y-8 py-14 sm:py-20">
    <header class="max-w-2xl space-y-4">
      <h1 class="text-5xl font-semibold tracking-tight sm:text-6xl">Revenue integrations</h1>
      <p class="text-lg leading-7 text-muted-foreground">Map a provider’s products and customers to the agreement. Review uncertain amounts and coverage gaps before using them in a statement.</p>
    </header>
    <div class="grid gap-4 sm:grid-cols-2">
      <Card v-for="provider in providers" :key="provider.slug">
        <CardHeader><CardTitle><h2>{{ provider.name }}</h2></CardTitle></CardHeader>
        <CardContent class="space-y-3">
          <p class="leading-7 text-muted-foreground">{{ provider.summary }}</p>
          <NuxtLink :to="`/integrations/${provider.slug}`" class="inline-flex min-h-11 items-center font-medium underline underline-offset-4">Explore {{ provider.name }}</NuxtLink>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
