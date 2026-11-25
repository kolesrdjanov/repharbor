<script setup lang="ts">
import { onMounted } from 'vue';
import { loadAll, portfolio } from '@/api/engagements';
import { useQuery } from '@/composables/query';
import EngagementList from './EngagementList.vue';
import InviteForm from './InviteForm.vue';
import QueryStatus from './QueryStatus.vue';

const { data, busy, error, reload } = useQuery((signal) => loadAll((cursor) => portfolio(cursor, signal)));
onMounted(reload);
</script>

<template>
  <h1 tabindex="-1" class="text-3xl font-semibold tracking-tight focus:outline-none">Your portfolio</h1>
  <QueryStatus :busy="busy" :error="error" @retry="reload" />
  <EngagementList v-if="data" :items="data" />
  <InviteForm @sent="reload" />
</template>
