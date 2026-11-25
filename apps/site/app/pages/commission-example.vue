<script setup lang="ts">
usePublicPage('Worked commission statement example | RepHarbor',
  'See how ten €200 sales at 20%, an external payment, and a partial refund leave €230.00 outstanding.', '/commission-example');
</script>

<template>
  <div class="page-width grid items-start gap-10 py-14 sm:py-20 lg:grid-cols-[1fr_0.95fr]">
    <div class="space-y-5">
      <h1 class="text-5xl font-semibold tracking-tight sm:text-6xl">How a commission balance changes</h1>
      <p class="text-lg leading-7 text-muted-foreground">A founder agrees to pay a sales rep 20% of eligible collections after discounts, excluding tax and before fees.</p>
      <ol class="list-decimal space-y-3 pl-5 leading-7">
        <li>Ten customers generate €200.00 each in eligible sales. The rep accrues €400.00.</li>
        <li>The founder records €150.00 already paid outside RepHarbor. The outstanding balance drops to €250.00.</li>
        <li>A €100.00 eligible refund reverses €20.00 at the original rate. Both parties see €230.00 outstanding.</li>
      </ol>
      <p class="leading-7 text-muted-foreground">The agreed payment deadline determines when the outstanding amount becomes due. Statements keep currencies separate.</p>
    </div>
    <StatementExample />
  </div>
</template>
