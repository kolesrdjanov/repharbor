import { safeReturnPath } from '@repharbor/contracts';
import { createRouter, createWebHistory } from 'vue-router';
import { captureFragment } from '@/features/auth/handoff';
import { useSession } from '@/stores/session';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/portfolio' },
    { path: '/sign-in', name: 'sign-in', meta: { title: 'Sign in' }, component: () => import('@/features/auth/SignIn.vue') },
    { path: '/sign-in/check-email', name: 'check-email', meta: { title: 'Check your email' }, component: () => import('@/features/auth/CheckEmail.vue') },
    { path: '/auth/confirm', name: 'confirm', meta: { title: 'Confirm sign-in' }, component: () => import('@/features/auth/ConfirmSignIn.vue') },
    { path: '/invite', name: 'invite', meta: { title: 'Invitation' }, component: () => import('@/features/auth/InviteLanding.vue') },
    {
      path: '/', meta: { requiresSession: true }, component: () => import('@/features/auth/SessionShell.vue'),
      children: [
        { path: 'portfolio', name: 'portfolio', meta: { title: 'Your portfolio' }, component: () => import('@/features/auth/ContextHome.vue') },
        { path: 'companies/:companyId', name: 'company', meta: { title: 'Company' }, component: () => import('@/features/auth/ContextHome.vue') },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/portfolio' },
  ],
});

router.beforeEach(async (to) => {
  if (to.hash && ['confirm', 'invite'].includes(String(to.name))) {
    captureFragment(to.path, to.hash);
    return { path: to.path, query: to.query, replace: true };
  }

  const session = useSession();
  if (to.meta.requiresSession || to.name === 'invite') await session.bootstrap();
  if (to.meta.requiresSession && session.ready && !session.identity) {
    return { name: 'sign-in', query: { next: safeReturnPath(to.fullPath) } };
  }
});
