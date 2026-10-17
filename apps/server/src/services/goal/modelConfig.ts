import type { GoalConfig, UserSystemAgentConfig } from '@lobechat/types';

import { UserModel } from '@/database/models/user';
import type { LobeChatDatabase } from '@/database/type';
import { resolveSystemAgentModelConfig } from '@/server/services/systemAgent/modelConfig';

export const resolveGoalModelConfig = async (db: LobeChatDatabase, userId: string) => {
  const settings = await new UserModel(db, userId).getUserSettings();
  const systemAgent = settings?.systemAgent as Partial<UserSystemAgentConfig> | undefined;

  return resolveSystemAgentModelConfig({
    taskConfig: systemAgent?.goal,
    taskKey: 'goal',
  });
};

/**
 * The goal's own pick for its planning turns, as `execAgent` params. Empty when
 * the goal has none, so the run keeps the goal agent's model.
 */
export const goalModelOverride = (config?: GoalConfig | null) => ({
  ...(config?.model && { model: config.model }),
  ...(config?.provider && { provider: config.provider }),
});
