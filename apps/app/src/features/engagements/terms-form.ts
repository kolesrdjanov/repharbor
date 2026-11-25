import { ref } from 'vue';
import { terms } from '@repharbor/contracts';

export function useTermsForm() {
  const rate = ref(20);
  const mode = ref<'first_payment' | 'recurring'>('recurring');
  const months = ref(12);
  const dueDay = ref(10);
  const effective = ref(new Date().toISOString().slice(0, 10));

  function input(timeZone: string) {
    return terms.parse({
      rateBps: Math.round(Number(rate.value) * 100), accrualMode: mode.value,
      eligibilityMonths: Number(months.value), dueDay: Number(dueDay.value),
      basis: 'collected_ex_tax_before_fees', refundPolicy: 'reverse_original_rate', cadence: 'monthly',
      timeZone, effectiveAt: `${effective.value}T00:00:00Z`,
    });
  }
  return { rate, mode, months, dueDay, effective, input };
}
