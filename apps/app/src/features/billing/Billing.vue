<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { billing, hostedBilling } from '@repharbor/contracts';
import { request } from '@/api/client';
import { useMutation, useQuery } from '@/composables/query';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import QueryStatus from '@/features/engagements/QueryStatus.vue';

const companyId = String(useRoute().params.companyId);
const resource = `/companies/${encodeURIComponent(companyId)}/billing`;
const { data, busy, error, reload } = useQuery((signal) => request(resource, { signal }, billing));
const { pending, message, submit } = useMutation();
const keys: Partial<Record<'checkout' | 'portal', string>> = {};

function open(action: 'checkout' | 'portal') {
  return submit(async () => {
    keys[action] ??= crypto.randomUUID();
    const session = await request(`${resource}/${action}`, { method: 'POST', headers: { 'Idempotency-Key': keys[action] } }, hostedBilling);
    location.assign(session.url);
  });
}

onMounted(reload);
</script>

<template>
  <h1 tabindex="-1" class="text-3xl font-semibold tracking-tight focus:outline-none">RepHarbor subscription</h1>
  <Button as-child variant="outline" class="h-11"><RouterLink :to="{ name: 'company', params: { companyId } }">Back to company</RouterLink></Button>
  <QueryStatus :busy="busy" :error="error" @retry="reload" />
  <Card v-if="data">
    <CardHeader>
      <h2 class="text-lg font-semibold capitalize">{{ data.status.replaceAll('_', ' ') }}</h2>
      <p v-if="data.currentPeriodEnd" class="text-sm text-muted-foreground">Current period ends {{ data.currentPeriodEnd.slice(0, 10) }}</p>
    </CardHeader>
    <CardContent class="space-y-4">
      <p class="text-sm text-muted-foreground">This subscription covers your company’s RepHarbor workspace.</p>
      <Alert v-if="message"><AlertDescription>{{ message }}</AlertDescription></Alert>
      <div class="flex flex-wrap gap-2">
        <Button v-if="data.checkoutAvailable" class="h-11" :disabled="pending" @click="open('checkout')">Start subscription</Button>
        <Button v-if="data.portalAvailable" variant="outline" class="h-11" :disabled="pending" @click="open('portal')">Manage subscription</Button>
      </div>
    </CardContent>
  </Card>
</template>
