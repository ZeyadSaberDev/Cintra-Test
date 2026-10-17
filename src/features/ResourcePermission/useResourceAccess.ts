import { useHasActiveWorkspace } from '@/business/client/hooks/useHasActiveWorkspace';
import { useClientDataSWR } from '@/libs/swr';
import { resourcePermissionKeys } from '@/libs/swr/keys';
import { getCacheScope } from '@/libs/swr/useCacheScope';
import type { PermissionResourceType } from '@/services/resourcePermission';
import { resourcePermissionService } from '@/services/resourcePermission';

/**
 * Resources whose access record the server has returned during this page
 * session. The record itself is persisted, so a cached value can predate a
 * downgrade; only a record re-fetched since boot is trusted for management.
 *
 * Keyed by the cache scope (user + workspace) too: switching identity swaps
 * the persisted partition without a reload, and a confirmation earned in one
 * scope must not vouch for another scope's cached record of the same id.
 */
const confirmedThisSession = new Set<string>();

const sessionKey = (scope: string, resourceType: PermissionResourceType, resourceId: string) =>
  `${scope}|${resourceType}:${resourceId}`;

/** Thrown when the cache scope changed while an access request was in flight. */
export class AccessScopeChangedError extends Error {
  constructor() {
    super('Cache scope changed before the access record settled');
    this.name = 'AccessScopeChangedError';
  }
}

/** Fetch the General-access record and remember that this session confirmed it. */
export const fetchGeneralAccess = async (
  resourceType: PermissionResourceType,
  resourceId: string,
) => {
  // The scope the request was issued under, not whichever one is active when
  // it settles.
  const scope = getCacheScope();
  const result = await resourcePermissionService.getGeneralAccess(resourceType, resourceId);
  // The SWR key carries no user id, so after an in-place account switch the
  // previous user's answer would land in (and persist to) the new user's
  // partition. Reject it; the scope reload revalidates under the new identity.
  if (getCacheScope() !== scope) throw new AccessScopeChangedError();
  confirmedThisSession.add(sessionKey(scope, resourceType, resourceId));
  return result;
};

/** Test-only: forget which records this session has confirmed. */
export const resetConfirmedAccessForTest = () => confirmedThisSession.clear();

/**
 * Read-side derivation of the workspace General-access level for a resource.
 *
 * Edit/use checks stay permissive while workspace access is loading so chat
 * input does not flash disabled. A server-confirmed creator/admin (`canManage`)
 * bypasses the public resource's Member Permissions. Management checks are
 * deliberately fail-closed: destructive/ownership controls must not appear
 * until that access is confirmed. Personal mode keeps full access.
 *
 * The access record is persisted (local cache tier), so after a reload edit/use
 * checks resolve from the last server-confirmed value while it revalidates.
 * `isAccessConfirmed` is only true once the current session has re-fetched it.
 * Use it before acting on a denial (redirects); `canManageResource` already
 * requires it, so a cached manager grant the user has since lost never shows
 * management controls.
 */
export const useResourceAccess = (
  resourceType: PermissionResourceType,
  resourceId: string | undefined,
) => {
  const hasActiveWorkspace = useHasActiveWorkspace();
  const enabled = hasActiveWorkspace && !!resourceId;

  // `isValidating` is read (and returned) so the hook re-renders when a
  // revalidation settles with an unchanged record — that is when the session
  // confirmation flips.
  const { data, error, isLoading, isValidating, mutate } = useClientDataSWR(
    enabled ? resourcePermissionKeys.generalAccess(resourceType, resourceId!) : null,
    () => fetchGeneralAccess(resourceType, resourceId!),
  );

  const isAccessConfirmed =
    !enabled ||
    (!!data &&
      !error &&
      confirmedThisSession.has(sessionKey(getCacheScope(), resourceType, resourceId!)));

  return {
    accessError: error,
    canEditResource: !enabled || !data ? true : data.canManage || data.accessLevel === 'edit',
    canManageResource: !enabled || (isAccessConfirmed && data?.canManage === true),
    canUseResource: !enabled || !data ? true : data.canManage || data.accessLevel !== 'view',
    isAccessConfirmed,
    isAccessResolved: !enabled || !!data,
    isLoading,
    isValidating,
    retryAccess: mutate,
  };
};
