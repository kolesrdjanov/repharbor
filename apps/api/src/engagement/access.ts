import type { Prisma } from '@prisma/client';
import { ApiError } from '../http';

export type Actor = { id: string; userId: string; email: string; pendingInvitationId: string | null };
export type Role = 'founder' | 'rep';
export const resourceNotFound = () => new ApiError(404, 'NOT_FOUND', 'This resource is unavailable.');
const unavailable = () => new ApiError(403, 'FORBIDDEN', 'Your current role cannot perform this action.');

export async function requireFounder(db: Prisma.TransactionClient, actor: Actor, companyId: string) {
  const membership = await db.companyFounder.findUnique({
    where: { companyId_userId: { companyId, userId: actor.userId } },
  });
  if (!membership) throw resourceNotFound();
}

const scopedEngagement = (actor: Actor, id: string) => ({
  id,
  OR: [
    { repId: actor.userId },
    { product: { company: { founders: { some: { userId: actor.userId } } } } },
  ],
}) satisfies Prisma.EngagementWhereInput;

export async function requireEngagement(
  db: Prisma.TransactionClient, actor: Actor, id: string, requiredRole?: Role, lock = false,
) {
  if (lock) {
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT e.id FROM engagement e
      WHERE e.id = ${id}::uuid AND (
        e.rep_id = ${actor.userId}::uuid OR EXISTS (
          SELECT 1 FROM company_founder f WHERE f.company_id = e.company_id AND f.user_id = ${actor.userId}::uuid
        )
      )
      FOR UPDATE
    `;
    if (!rows.length) throw resourceNotFound();
  }
  const item = await db.engagement.findFirst({
    where: scopedEngagement(actor, id),
    include: { product: { include: { company: { include: {
      founders: { where: { userId: actor.userId }, select: { userId: true } },
    } } } } },
  });
  if (!item) throw resourceNotFound();
  const founder = item.product.company.founders.length > 0;
  const rep = item.repId === actor.userId;
  if ((requiredRole === 'founder' && !founder) || (requiredRole === 'rep' && !rep)) throw unavailable();
  const role: Role = requiredRole ?? (founder ? 'founder' : 'rep');
  return { item, role };
}
