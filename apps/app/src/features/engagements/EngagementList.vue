<script setup lang="ts">
import type { components } from '@repharbor/contracts';
import { Button } from '@repharbor/ui/components/ui/button';
import { formatMoney } from '@/features/statements/money';
import { Card, CardContent, CardHeader, CardTitle } from '@repharbor/ui/components/ui/card';

defineProps<{ items: components['schemas']['EngagementSummary'][]; founder?: boolean }>();
</script>

<template>
  <Card>
    <CardHeader><CardTitle><h2>Engagements</h2></CardTitle></CardHeader>
    <CardContent>
      <p v-if="!items.length" class="text-sm text-muted-foreground">No engagements yet. Send an invitation to get started.</p>
      <ul v-else class="divide-y">
        <li v-for="item in items" :key="item.engagement.id" class="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
          <div class="min-w-0">
            <p class="font-medium">{{ founder ? item.productName : item.companyName }}</p>
            <p class="break-words text-sm text-muted-foreground">
              {{ founder ? item.repEmail || 'Invitation sent' : item.productName }} · {{ item.engagement.status }}
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
          <div v-if="item.balances.length" class="mr-2 text-sm tabular-nums">
            <p v-for="balance in item.balances" :key="balance.currency">
              {{ balance.outstandingMinor.startsWith('-') ? 'Credit' : 'Outstanding' }} {{ formatMoney(balance.outstandingMinor.replace(/^-/, ''), balance.currency) }}
              · {{ formatMoney(balance.dueMinor, balance.currency) }} due
            </p>
          </div>
          <Button v-if="item.engagement.status !== 'invited'" as-child variant="outline">
            <RouterLink :to="{ name: 'statement', params: { engagementId: item.engagement.id } }">Statement</RouterLink>
          </Button>
          <Button as-child variant="outline">
            <RouterLink :to="{ name: 'terms', params: { engagementId: item.engagement.id } }">
              <span class="sr-only">{{ item.productName }} </span>View terms
            </RouterLink>
          </Button>
          </div>
        </li>
      </ul>
    </CardContent>
  </Card>
</template>
