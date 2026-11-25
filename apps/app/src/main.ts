import { createPinia } from 'pinia';
import { createApp } from 'vue';
import { createRouter, createWebHistory, RouterView } from 'vue-router';
import './style.css';

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/', component: () => import('./Workspace.vue') }],
});

createApp(RouterView).use(createPinia()).use(router).mount('#app');
