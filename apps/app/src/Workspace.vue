<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { health } from '@repharbor/contracts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { API_ORIGIN } from './config';

const status = ref<'checking' | 'ready' | 'unavailable'>('checking');

async function checkApi() {
  status.value = 'checking';
  try {
    const response = await fetch(new URL('/health', API_ORIGIN), { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error('API unavailable');
    health.parse(await response.json());
    status.value = 'ready';
  } catch {
    status.value = 'unavailable';
  }
}

onMounted(checkApi);
</script>

<template>
  <main class="mx-auto grid min-h-dvh max-w-lg content-center px-5 py-10 sm:px-8">
    <Card>
      <CardHeader>
        <h1 class="text-2xl font-semibold tracking-tight">RepHarbor</h1>
        <CardDescription>Private workspace</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <p role="status" class="text-sm text-muted-foreground">
          {{ status === 'ready' ? 'API connection ready.' : status === 'checking' ? 'Checking API connection…' : 'The API is unavailable.' }}
        </p>
        <Button v-if="status === 'unavailable'" variant="outline" class="min-h-11" @click="checkApi">
          Check again
        </Button>
      </CardContent>
    </Card>
  </main>
</template>
