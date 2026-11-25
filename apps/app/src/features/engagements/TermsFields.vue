<script setup lang="ts">
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

const prefix = defineProps<{ prefix: string }>();
const rate = defineModel<number>('rate', { required: true });
const mode = defineModel<'first_payment' | 'recurring'>('mode', { required: true });
const months = defineModel<number>('months', { required: true });
const dueDay = defineModel<number>('dueDay', { required: true });
const effective = defineModel<string>('effective', { required: true });
</script>

<template>
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="space-y-2">
      <Label :for="`${prefix.prefix}-rate`">Commission rate (%)</Label>
      <Input :id="`${prefix.prefix}-rate`" v-model.number="rate" type="number" min="0" max="100" step="0.01" class="h-11" required />
    </div>
    <div class="space-y-2">
      <Label :for="`${prefix.prefix}-mode`">Eligible payments</Label>
      <NativeSelect :id="`${prefix.prefix}-mode`" v-model="mode" class="h-11">
        <NativeSelectOption value="recurring">Recurring payments</NativeSelectOption>
        <NativeSelectOption value="first_payment">First payment only</NativeSelectOption>
      </NativeSelect>
    </div>
    <div class="space-y-2">
      <Label :for="`${prefix.prefix}-months`">Eligibility (months)</Label>
      <Input :id="`${prefix.prefix}-months`" v-model.number="months" type="number" min="1" step="1" class="h-11" required />
    </div>
    <div class="space-y-2">
      <Label :for="`${prefix.prefix}-due`">Due day next month</Label>
      <Input :id="`${prefix.prefix}-due`" v-model.number="dueDay" type="number" min="1" max="28" step="1" class="h-11" required />
    </div>
    <div class="space-y-2">
      <Label :for="`${prefix.prefix}-effective`">Effective date (UTC)</Label>
      <Input :id="`${prefix.prefix}-effective`" v-model="effective" type="date" class="h-11" required />
    </div>
  </div>
  <p class="text-sm text-muted-foreground">Calculated on collections after discounts, excluding tax and before fees. Refunds use the original rate.</p>
</template>
