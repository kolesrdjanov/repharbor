<script setup lang="ts">
import type { components } from '@repharbor/contracts';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatMoney } from './money';

defineProps<{ balances: components['schemas']['Balance'][] }>();
</script>

<template>
  <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
    <Card v-for="balance in balances" :key="balance.currency" class="gap-3">
      <CardHeader>
        <p class="text-xs font-semibold tracking-wider text-muted-foreground">{{ balance.currency }}</p>
        <p class="mt-1 text-sm font-medium">{{ balance.outstandingMinor.startsWith('-') ? 'Company credit' : 'Outstanding' }}</p>
        <p class="text-3xl font-semibold tracking-tight tabular-nums">{{ formatMoney(balance.outstandingMinor.replace(/^-/, ''), balance.currency) }}</p>
      </CardHeader>
      <CardContent>
        <dl class="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-sm">
          <dt class="text-muted-foreground">Accrued</dt><dd class="text-right font-medium tabular-nums">{{ formatMoney(balance.accruedMinor, balance.currency) }}</dd>
          <dt class="text-muted-foreground">Due now</dt><dd class="text-right font-medium tabular-nums">{{ formatMoney(balance.dueMinor, balance.currency) }}</dd>
          <dt class="text-muted-foreground">Recorded payments</dt><dd class="text-right font-medium tabular-nums">{{ formatMoney(balance.recordedPaymentsMinor, balance.currency) }}</dd>
        </dl>
        <p v-if="balance.openingStatus === 'unknown'" class="mt-4 border-t pt-3 text-xs text-muted-foreground">Opening balance unconfirmed</p>
      </CardContent>
    </Card>
  </div>
</template>
