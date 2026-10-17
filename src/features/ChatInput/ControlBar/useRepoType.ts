import { isDesktop } from '@lobechat/const';
import { getWorkingDirEffectivePath } from '@lobechat/types';
import { useEffect, useMemo } from 'react';

import { useClientDataSWR } from '@/libs/swr';
import { deviceKeys } from '@/libs/swr/keys';
import { gitService } from '@/services/git';
import { deviceSelectors, type DeviceStore, useDeviceStore } from '@/store/device';
import { useElectronStore } from '@/store/electron';

import { getRecentDirs, setRecentDirRepoType } from './recentDirs';

export type RepoType = 'git' | 'github' | undefined;

/**
 * Resolve the repo type for a working directory on `deviceId` (the local machine
 * when omitted).
 *
 * The cached value renders first: the device's persisted `workingDirs[].repoType`
 * (the local machine's own gateway device when `deviceId` is omitted), then —
 * local machine only — the legacy localStorage recents. That cache is only a
 * snapshot from when the dir was registered, so the dir is re-probed in the
 * background each time it is shown: over IPC on the local machine, through the
 * device's `statPath` RPC on a remote one. A settled probe wins, and when it
 * disagrees it is written back to the device entry so every other reader of
 * `workingDirs` (picker icons, send-time git snapshot) converges — e.g. a folder
 * registered while still empty and cloned into afterwards. A probe that could
 * not run (device offline, path gone) keeps the cached value.
 */
export const useRepoType = (path?: string, deviceId?: string): RepoType => {
  const currentDeviceId = useElectronStore((s) => s.gatewayDeviceInfo?.deviceId);
  const isLocalTarget = !deviceId || deviceId === currentDeviceId;
  const cacheDeviceId = deviceId ?? currentDeviceId;

  // Persisted repoType from the (local or remote) device's working dirs.
  const findEntry = (s: DeviceStore) =>
    path
      ? deviceSelectors
          .getDeviceWorkingDirs(cacheDeviceId)(s)
          .find((d) => d.path === path || getWorkingDirEffectivePath(d) === path)
      : undefined;
  const fromDevice = useDeviceStore((s) => findEntry(s)?.repoType);
  // Only a listed dir is written back; tracked so a probe that settles before
  // the device list loads still syncs once the entry appears.
  const isListed = useDeviceStore((s) => !!findEntry(s));

  // Legacy localStorage fast path — local machine only.
  const cachedLocal = useMemo<RepoType>(() => {
    if (!isLocalTarget || !path) return undefined;
    return getRecentDirs().find((d) => d.path === path)?.repoType;
  }, [isLocalTarget, path]);

  const cached = fromDevice ?? cachedLocal;

  // The local filesystem is only reachable from the desktop app.
  const probeDeviceId = isLocalTarget ? undefined : deviceId;
  const canProbe = !!path && (!isLocalTarget || isDesktop);

  const { data: probe } = useClientDataSWR(
    canProbe ? deviceKeys.repoType(probeDeviceId ?? 'local', path) : null,
    () => gitService.detectRepoType({ deviceId: probeDeviceId, path: path! }),
    {
      dedupingInterval: 60 * 1000,
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );

  const syncWorkingDirRepoType = useDeviceStore((s) => s.syncWorkingDirRepoType);

  useEffect(() => {
    if (!path || !probe) return;
    if (isLocalTarget) setRecentDirRepoType(path, probe.repoType);
    if (!cacheDeviceId || !isListed || probe.repoType === fromDevice) return;
    syncWorkingDirRepoType(cacheDeviceId, path, probe.repoType).catch((error) => {
      console.error('Failed to sync working directory repo type', error);
    });
  }, [cacheDeviceId, fromDevice, isListed, isLocalTarget, path, probe, syncWorkingDirRepoType]);

  return probe ? probe.repoType : cached;
};
