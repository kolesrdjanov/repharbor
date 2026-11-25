<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { companyDashboard, createProduct, listProducts, loadAll } from '@/api/engagements';
import { useMutation, useQuery } from '@/composables/query';
import { Alert, AlertDescription } from '@repharbor/ui/components/ui/alert';
import { Button } from '@repharbor/ui/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@repharbor/ui/components/ui/card';
import { Input } from '@repharbor/ui/components/ui/input';
import { Label } from '@repharbor/ui/components/ui/label';
import { useSession } from '@/stores/session';
import EngagementList from './EngagementList.vue';
import InviteForm from './InviteForm.vue';
import QueryStatus from './QueryStatus.vue';

const route = useRoute();
const session = useSession();
const companyId = String(route.params.companyId);
const company = computed(() => session.identity?.companies.find((item) => item.id === companyId));
const { data, busy, error, reload } = useQuery(async (signal) => {
  const [products, engagements] = await Promise.all([
    loadAll((cursor) => listProducts(companyId, cursor, signal)),
    loadAll((cursor) => companyDashboard(companyId, cursor, signal)),
  ]);
  return { products, engagements };
});
const name = ref('');
const { pending, message, submit } = useMutation();
const feedback = ref('');

async function addProduct() {
  await submit(async () => {
    const created = await createProduct(companyId, { name: name.value });
    feedback.value = `${created.name} added.`;
    name.value = '';
    await reload();
  });
}

onMounted(() => { if (company.value) void reload(); });
</script>

<template>
  <h1 tabindex="-1" class="text-3xl font-semibold tracking-tight focus:outline-none">{{ company?.name ?? 'Company unavailable' }}</h1>
  <p v-if="!company" class="text-sm text-muted-foreground">Choose a company from your workspace.</p>
  <template v-else>
    <div class="flex flex-wrap gap-2">
      <Button as-child variant="outline"><RouterLink :to="{ name: 'integrations', params: { companyId } }">Integrations</RouterLink></Button>
      <Button as-child variant="outline"><RouterLink :to="{ name: 'review', params: { companyId } }">Review sales</RouterLink></Button>
      <Button as-child variant="outline"><RouterLink :to="{ name: 'billing', params: { companyId } }">Subscription</RouterLink></Button>
    </div>
    <QueryStatus :busy="busy" :error="error" @retry="reload" />
    <EngagementList v-if="data" :items="data.engagements" founder />
    <Card>
      <CardHeader><CardTitle><h2>Products</h2></CardTitle></CardHeader>
      <CardContent>
        <ul v-if="data?.products.length" class="mb-5 space-y-2 text-sm">
          <li v-for="item in data.products" :key="item.id">{{ item.name }}</li>
        </ul>
        <p v-else-if="data" class="mb-5 text-sm text-muted-foreground">Add a product before inviting a sales rep.</p>
        <form class="space-y-3" @submit.prevent="addProduct">
          <div class="space-y-2"><Label for="product-name">Product name</Label><Input id="product-name" v-model="name" required /></div>
          <Alert v-if="message"><AlertDescription>{{ message }}</AlertDescription></Alert>
          <Button type="submit" variant="outline" :disabled="pending">{{ pending ? 'Adding…' : 'Add product' }}</Button>
          <p v-if="feedback" role="status" class="text-sm">{{ feedback }}</p>
        </form>
      </CardContent>
    </Card>
    <InviteForm v-if="data?.products.length" :company="company" :products="data.products" @sent="reload" />
  </template>
</template>
