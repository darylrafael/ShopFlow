import prisma from './prisma';
import { getAuthenticatedUser } from './auth/session';

/** Resolve the organization from the authenticated session, with a local-only demo fallback. */
export async function getDevelopmentOrgId(): Promise<string> {
  const user = await getAuthenticatedUser();
  if (user) return user.orgId;
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('Authentication required');
  }

  const org = await prisma.organization.findFirst({
    where: { name: 'Development Org' },
  });
  
  if (!org) {
    throw new Error('Development Organization not found. Did you run the seed script?');
  }
  
  return org.id;
}
