import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResourceGeneralAccess } from '@/services/resourcePermission';

import {
  AccessScopeChangedError,
  fetchGeneralAccess,
  resetConfirmedAccessForTest,
  useResourceAccess,
} from './useResourceAccess';

const testState = vi.hoisted(() => ({
  data: undefined as ResourceGeneralAccess | undefined,
  fetcher: undefined as (() => Promise<ResourceGeneralAccess>) | undefined,
  getGeneralAccess: vi.fn(),
  hasActiveWorkspace: true,
  isValidating: false,
  scope: 'user-1:ws-a',
}));

vi.mock('@/business/client/hooks/useHasActiveWorkspace', () => ({
  useHasActiveWorkspace: () => testState.hasActiveWorkspace,
}));

vi.mock('@/libs/swr/useCacheScope', () => ({
  getCacheScope: () => testState.scope,
}));

vi.mock('@/services/resourcePermission', () => ({
  resourcePermissionService: { getGeneralAccess: testState.getGeneralAccess },
}));

vi.mock('@/libs/swr', () => ({
  useClientDataSWR: (_key: unknown, fetcher: () => Promise<ResourceGeneralAccess>) => {
    testState.fetcher = fetcher;
    return {
      data: testState.data,
      error: undefined,
      isLoading: false,
      isValidating: testState.isValidating,
      mutate: vi.fn(),
    };
  },
}));

const record = (overrides: Partial<ResourceGeneralAccess>): ResourceGeneralAccess => ({
  accessLevel: 'edit',
  canManage: false,
  creatorId: 'creator',
  generalAccess: 'editor',
  visibility: 'public',
  ...overrides,
});

/** Simulate SWR settling a revalidation: the fetcher resolves into `data`. */
const revalidate = async (fresh: ResourceGeneralAccess) => {
  testState.getGeneralAccess.mockResolvedValueOnce(fresh);
  testState.data = await testState.fetcher!();
  testState.isValidating = false;
};

describe('useResourceAccess', () => {
  beforeEach(() => {
    resetConfirmedAccessForTest();
    testState.data = undefined;
    testState.fetcher = undefined;
    testState.getGeneralAccess.mockReset();
    testState.hasActiveWorkspace = true;
    testState.isValidating = false;
    testState.scope = 'user-1:ws-a';
  });

  it('resolves from cached access while it revalidates, but does not confirm it yet', async () => {
    testState.data = record({});
    testState.isValidating = true;

    const { result, rerender } = renderHook(() => useResourceAccess('agent', 'agent-1'));

    expect(result.current).toMatchObject({
      canEditResource: true,
      isAccessConfirmed: false,
      isAccessResolved: true,
    });

    await revalidate(record({}));
    rerender();

    expect(result.current.isAccessConfirmed).toBe(true);
  });

  // Regression: a persisted `canManage: true` from an earlier session rendered
  // management controls before the re-check, even if the user had since been
  // demoted. Management must stay fail-closed until this session confirms it.
  it('keeps management hidden for a cached manager grant until this session re-confirms it', async () => {
    testState.data = record({ canManage: true });
    testState.isValidating = true;

    const { result, rerender } = renderHook(() => useResourceAccess('agent', 'agent-1'));

    expect(result.current).toMatchObject({
      canEditResource: true,
      canManageResource: false,
      isAccessConfirmed: false,
    });

    await revalidate(record({ canManage: false }));
    rerender();

    expect(result.current).toMatchObject({ canManageResource: false, isAccessConfirmed: true });
  });

  it('grants management once this session has re-confirmed the manager grant', async () => {
    testState.data = record({ canManage: true });
    testState.isValidating = true;

    const { result, rerender } = renderHook(() => useResourceAccess('agent', 'agent-1'));
    expect(result.current.canManageResource).toBe(false);

    await revalidate(record({ canManage: true }));
    rerender();

    expect(result.current.canManageResource).toBe(true);
  });

  it('does not apply view-only Member Permissions to an Agent author or admin', async () => {
    renderHook(() => useResourceAccess('agent', 'agent-1'));
    await revalidate(record({ accessLevel: 'view', canManage: true, generalAccess: 'viewer' }));

    const { result } = renderHook(() => useResourceAccess('agent', 'agent-1'));

    expect(result.current).toMatchObject({
      canEditResource: true,
      canManageResource: true,
      canUseResource: true,
    });
  });

  it('still applies view-only Member Permissions to an ordinary member', async () => {
    renderHook(() => useResourceAccess('agent', 'agent-1'));
    await revalidate(record({ accessLevel: 'view', canManage: false, generalAccess: 'viewer' }));

    const { result } = renderHook(() => useResourceAccess('agent', 'agent-1'));

    expect(result.current).toMatchObject({
      canEditResource: false,
      canManageResource: false,
      canUseResource: false,
    });
  });

  // Regression: confirmations were keyed by resource id only, so after an
  // in-place user/workspace switch another scope's stale cached manager grant
  // for the same id counted as confirmed and showed management controls.
  it('does not carry a confirmation across a cache-scope switch', async () => {
    testState.data = record({ canManage: true });
    const { result, rerender } = renderHook(() => useResourceAccess('agent', 'agent-1'));

    await revalidate(record({ canManage: true }));
    rerender();
    expect(result.current.canManageResource).toBe(true);

    testState.scope = 'user-2:ws-b';
    testState.isValidating = true;
    rerender();

    expect(result.current).toMatchObject({ canManageResource: false, isAccessConfirmed: false });

    await revalidate(record({ canManage: true }));
    rerender();
    expect(result.current.canManageResource).toBe(true);
  });

  // Regression: the SWR key has no user id, so a request issued before an
  // in-place account switch that settled after it returned the previous
  // user's record into the new user's partition, where it was persisted.
  it('rejects an access record that settles after the cache scope changed', async () => {
    let settle!: (value: ResourceGeneralAccess) => void;
    testState.getGeneralAccess.mockReturnValueOnce(
      new Promise<ResourceGeneralAccess>((resolve) => {
        settle = resolve;
      }),
    );

    const pending = fetchGeneralAccess('agent', 'agent-1');
    testState.scope = 'user-2:ws-a';
    settle(record({ canManage: true }));

    await expect(pending).rejects.toBeInstanceOf(AccessScopeChangedError);

    testState.data = record({ canManage: true });
    const { result } = renderHook(() => useResourceAccess('agent', 'agent-1'));
    expect(result.current).toMatchObject({ canManageResource: false, isAccessConfirmed: false });
  });
});
