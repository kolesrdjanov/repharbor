<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { providers } from '#shared/content';

definePageMeta({ key: (route) => route.path });

const slug = useRoute().params.provider;
const provider = providers.find((item) => item.slug === slug);
if (!provider) throw createError({ statusCode: 404, statusMessage: 'Integration unavailable' });

usePublicPage(`${provider.name} commission tracking | RepHarbor`, provider.summary, `/integrations/${provider.slug}`);

const signIn = new URL('/sign-in', useRuntimeConfig().public.appOrigin).href;
</script>

<template>
  <article v-if="provider" class="page-width max-w-4xl space-y-8 py-14 sm:py-20">
    <NuxtLink to="/integrations" class="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">All integrations</NuxtLink>
    <header class="space-y-4">
      <h1 class="text-5xl font-semibold tracking-tight sm:text-6xl">{{ provider.name }} commission tracking</h1>
      <p class="text-xl leading-8 text-muted-foreground">{{ provider.summary }}</p>
    </header>
    <section class="space-y-4 border-y bg-card px-5 py-7 sm:px-8">
      <h2 class="text-2xl font-semibold tracking-tight">How the connection works</h2>
      <p v-for="paragraph in provider.details" :key="paragraph" class="leading-7 text-muted-foreground">{{ paragraph }}</p>
    </section>
    <div class="flex flex-wrap items-center gap-4">
      <Button as-child size="lg" class="min-h-12"><NuxtLink :to="signIn" external>Open RepHarbor</NuxtLink></Button>
      <a :href="provider.link" class="inline-flex min-h-11 items-center font-medium underline underline-offset-4">Provider documentation</a>
    </div>
  </article>
</template>
