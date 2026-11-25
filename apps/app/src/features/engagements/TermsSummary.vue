<script setup lang="ts">
import type { components } from '@repharbor/contracts';

defineProps<{ terms: components['schemas']['AgreementVersion'] }>();
</script>

<template>
  <dl class="grid gap-x-5 gap-y-3 text-sm sm:grid-cols-[minmax(10rem,0.8fr)_1.2fr]">
    <div class="space-y-1"><dt class="text-muted-foreground">Commission rate</dt><dd>{{ terms.rateBps / 100 }}%</dd></div>
    <div class="space-y-1"><dt class="text-muted-foreground">Basis</dt><dd>Collected after discounts, excluding tax and before fees</dd></div>
    <div class="space-y-1"><dt class="text-muted-foreground">Eligible payments</dt><dd>{{ terms.accrualMode === 'recurring' ? 'Recurring payments' : 'First payment only' }}</dd></div>
    <div class="space-y-1"><dt class="text-muted-foreground">Eligibility</dt><dd>{{ terms.eligibilityMonths }} months from the first eligible payment</dd></div>
    <div class="space-y-1"><dt class="text-muted-foreground">Refunds</dt><dd>Reverse at the original rate</dd></div>
    <div class="space-y-1"><dt class="text-muted-foreground">Statement and due date</dt><dd>Monthly, due on day {{ terms.dueDay }} of the following month ({{ terms.timeZone }})</dd></div>
    <div class="space-y-1"><dt class="text-muted-foreground">Effective from</dt><dd><time :datetime="terms.effectiveAt">{{ new Date(terms.effectiveAt).toLocaleString('en-GB', { timeZone: terms.timeZone, dateStyle: 'medium', timeStyle: 'short' }) }}</time></dd></div>
    <div class="space-y-1"><dt class="text-muted-foreground">Accepted by rep</dt><dd>{{ terms.repAcceptedAt ? new Date(terms.repAcceptedAt).toLocaleDateString('en-GB', { timeZone: terms.timeZone }) : 'Awaiting acceptance' }}</dd></div>
  </dl>
</template>
