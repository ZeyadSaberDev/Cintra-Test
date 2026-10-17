import { toast } from '@lobehub/ui';

import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';
import { goalSelectors, useGoalStore } from '@/store/goal';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/selectors';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/selectors';

interface UseGoalAgentModelParams {
  goalId: string;
  /**
   * The agent the page route is scoped to. The goal leaves that agent's list when
   * handed over, so the page follows it to the new agent's route.
   */
  routeAgentId?: string;
}

/**
 * The goal's main agent and the model it plans with: what the pickers show and
 * what a pick writes. The model falls back to the agent's own until the goal
 * overrides it.
 */
export const useGoalAgentModel = ({ goalId, routeAgentId }: UseGoalAgentModelParams) => {
  const navigate = useWorkspaceAwareNavigate();
  const agentId = useGoalStore((s) => goalSelectors.goalGraph(goalId)(s)?.goal.agentId);
  const goalModel = useGoalStore((s) => goalSelectors.goalGraph(goalId)(s)?.goal.config?.model);
  const goalProvider = useGoalStore(
    (s) => goalSelectors.goalGraph(goalId)(s)?.goal.config?.provider,
  );
  const setGoalAgent = useGoalStore((s) => s.setGoalAgent);
  const setGoalModel = useGoalStore((s) => s.setGoalModel);
  const heterogeneousType = useHomeStore(
    (s) => homeAgentListSelectors.getAgentById(agentId ?? '')(s)?.heterogeneousType,
  );

  // The fallback is the goal agent's own model, so its config has to be in the
  // store even when the surrounding page is about another agent.
  const isLogin = useUserStore(authSelectors.isLogin);
  const useHydrateAgentConfig = useAgentStore((s) => s.useHydrateAgentConfig);
  useHydrateAgentConfig(isLogin, agentId ?? '');
  const agentModel = useAgentStore((s) => agentByIdSelectors.getAgentModelById(agentId ?? '')(s));
  const agentProvider = useAgentStore((s) =>
    agentByIdSelectors.getAgentModelProviderById(agentId ?? '')(s),
  );

  const changeAgent = async (next: string | null) => {
    if (!next) return;
    try {
      await setGoalAgent(goalId, next);
      if (routeAgentId && routeAgentId !== next)
        navigate(`/agent/${next}/goal/${goalId}`, { replace: true });
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const changeModel = async (next: { model: string; provider: string }) => {
    // Picking the agent's own model is the same as not overriding it, and keeps
    // the goal following that agent when its model changes later.
    const isAgentDefault = next.model === agentModel && next.provider === agentProvider;
    try {
      await setGoalModel(goalId, isAgentDefault ? null : next);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return {
    agentId: agentId ?? undefined,
    changeAgent,
    changeModel,
    heterogeneousType,
    model: {
      model: goalModel || agentModel || '',
      provider: goalProvider || agentProvider || '',
    },
  };
};
