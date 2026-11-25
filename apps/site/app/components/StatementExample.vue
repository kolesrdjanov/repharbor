<script setup lang="ts">
import { expectedBalance, proposedAgreement, referencePayment, referenceRefund, referenceSales } from '@repharbor/contracts/reference';
import { Card, CardContent, CardHeader } from '@repharbor/ui/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repharbor/ui/components/ui/table';

function euro(value: bigint | string) {
  const cents = BigInt(value);
  const absolute = cents < BigInt(0) ? -cents : cents;
  return `${cents < BigInt(0) ? '−' : ''}€${absolute / BigInt(100)}.${String(absolute % BigInt(100)).padStart(2, '0')}`;
}

const rate = BigInt(proposedAgreement.rateBps);
const gross = referenceSales.reduce((total, sale) => total + BigInt(sale.basisMinor), BigInt(0));
const accrued = gross * rate / BigInt(10_000);
const refundDelta = -(BigInt(referenceRefund.basisMinor) * rate / BigInt(10_000));
const rows = [
  { name: 'Sales commission', detail: '10 sales × €200.00 × 20%', amount: euro(accrued) },
  { name: 'Recorded external payment', detail: 'Payment already sent by the founder', amount: euro(-BigInt(referencePayment.amountMinor)) },
  { name: 'Refund adjustment', detail: '€100.00 refund at the original 20% rate', amount: euro(refundDelta) },
];
</script>

<template>
  <Card class="h-fit gap-0 py-0">
    <CardHeader class="border-b bg-card px-5 py-6 sm:px-7">
      <p class="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">Sample commission statement</p>
      <p class="mt-4 text-sm font-medium text-muted-foreground">Outstanding</p>
      <p class="text-5xl font-semibold tracking-tighter tabular-nums sm:text-6xl">{{ euro(expectedBalance.outstandingMinor) }}</p>
    </CardHeader>
    <CardContent class="px-5 py-4 sm:px-7">
      <Table aria-label="Sample statement entries">
        <TableHeader>
          <TableRow><TableHead scope="col">Entry</TableHead><TableHead scope="col" class="text-right">Amount</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="row in rows" :key="row.name">
            <TableCell class="whitespace-normal py-3">
              <p class="font-medium">{{ row.name }}</p>
              <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">{{ row.detail }}</p>
            </TableCell>
            <TableCell class="text-right font-medium tabular-nums">{{ row.amount }}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </CardContent>
  </Card>
</template>
