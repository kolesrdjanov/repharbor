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
        { path: 'portfolio', name: 'portfolio', meta: { title: 'Your portfolio' }, component: () => import('@/features/engagements/Portfolio.vue') },
        { path: 'onboarding', name: 'onboarding', meta: { title: 'Create a company' }, component: () => import('@/features/engagements/CompanySetup.vue') },
        { path: 'engagements/:engagementId/terms', name: 'terms', meta: { title: 'Agreement terms' }, component: () => import('@/features/engagements/Engagement.vue') },
        { path: 'engagements/:engagementId/claims', name: 'claims', meta: { title: 'Customer claims' }, component: () => import('@/features/engagements/Engagement.vue') },
        { path: 'engagements/:engagementId/statement', name: 'statement', meta: { title: 'Statement' }, component: () => import('@/features/statements/Statement.vue') },
        { path: 'engagements/:engagementId/statement/entries/:entryId', name: 'statement-entry', meta: { title: 'Statement entry' }, component: () => import('@/features/statements/EntryDetail.vue') },
        { path: 'companies/:companyId', name: 'company', meta: { title: 'Company' }, component: () => import('@/features/engagements/Company.vue') },
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
