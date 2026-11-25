<script setup lang="ts">
import type { components } from '@repharbor/contracts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

defineProps<{ items: components['schemas']['EngagementSummary'][]; founder?: boolean }>();
</script>

<template>
  <Card>
    <CardHeader><h2 class="text-lg font-semibold">Engagements</h2></CardHeader>
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
          <Button as-child variant="outline" class="min-h-11">
            <RouterLink :to="{ name: 'terms', params: { engagementId: item.engagement.id } }">
              <span class="sr-only">{{ item.productName }} </span>View terms
            </RouterLink>
          </Button>
        </li>
      </ul>
    </CardContent>
  </Card>
</template>
