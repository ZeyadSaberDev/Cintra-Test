import { toast } from '@lobehub/ui';

import { useAgentModelSelection } from '@/features/ChatInput/hooks/useAgentModelSelection';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useAgentStore } from '@/store/agent';
import { goalSelectors, useGoalStore } from '@/store/goal';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/selectors';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/selectors';

type ModelConfig = { model: string; provider: string };

interface UseGoalAgentModelParams {
  goalId: string;
  /**
   * The agent the page route is scoped to. The goal leaves that agent's list when
   * handed over, so the page follows it to the new agent's route.
   */
  routeAgentId?: string;
}

/**
 * The model an agent runs on for the current caller — including a Workspace
 * member's own pick on a shared Agent — which a goal slot shows until the goal
 * overrides it. Hydrates the agent's config, since the surrounding page may be
 * about another agent.
 */
const useAgentOwnModel = (agentId?: string) => {
  const isLogin = useUserStore(authSelectors.isLogin);
  const useHydrateAgentConfig = useAgentStore((s) => s.useHydrateAgentConfig);
  useHydrateAgentConfig(isLogin, agentId ?? '');
  const loaded = useAgentStore((s) => !!agentId && !!s.agentMap[agentId]);
  const selection = useAgentModelSelection(agentId ?? '');
  const heterogeneousType = useHomeStore(
    (s) => homeAgentListSelectors.getAgentById(agentId ?? '')(s)?.heterogeneousType,
  );
  return {
    heterogeneousType,
    // The author pinned this shared Agent's model, so only they or an admin
    // may override it — the server refuses everyone else.
    locked: selection.usesWorkspaceMemberSelection && selection.selectionPolicy === 'fixed',
    model: selection.model,
    provider: selection.provider,
    // Until the agent and the caller's preference load, the fallback is a
    // repository default, and a pick compared against it would be misread.
    ready: loaded && !selection.isPreferenceLoading,
  };
};

/**
 * Who plans the goal and who does its Tasks, each with the model it runs on:
 * what the pickers show and what a pick writes. A model falls back to its
 * agent's own until the goal overrides it.
 */
export const useGoalAgentModel = ({ goalId, routeAgentId }: UseGoalAgentModelParams) => {
  const navigate = useWorkspaceAwareNavigate();
  const graph = goalSelectors.goalGraph(goalId);
  const agentId = useGoalStore((s) => graph(s)?.goal.agentId) ?? undefined;
  // Unset means the main agent does the goal's Tasks itself.
  const taskAgentId = useGoalStore((s) => graph(s)?.goal.config?.taskAgentId);
  const planningModel = useGoalStore((s) => graph(s)?.goal.config?.model);
  const planningProvider = useGoalStore((s) => graph(s)?.goal.config?.provider);
  const taskModel = useGoalStore((s) => graph(s)?.goal.config?.taskModel);
  const taskProvider = useGoalStore((s) => graph(s)?.goal.config?.taskProvider);
  const setGoalAgent = useGoalStore((s) => s.setGoalAgent);
  const setGoalModel = useGoalStore((s) => s.setGoalModel);
  const setGoalTaskAgent = useGoalStore((s) => s.setGoalTaskAgent);
  const setGoalTaskModel = useGoalStore((s) => s.setGoalTaskModel);

  const planner = useAgentOwnModel(agentId);
  const executor = useAgentOwnModel(taskAgentId ?? agentId);

  const run = async (write: () => Promise<void>) => {
    try {
      await write();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  // Picking the agent's own model is the same as not overriding it, and keeps
  // the slot following that agent when its model changes later.
  const overrideOf = (next: ModelConfig, own: { model?: string; provider?: string }) =>
    next.model === own.model && next.provider === own.provider ? null : next;

  const changeAgent = (next: string | null) =>
    run(async () => {
      if (!next) return;
      await setGoalAgent(goalId, next);
      if (routeAgentId && routeAgentId !== next)
        navigate(`/agent/${next}/goal/${goalId}`, { replace: true });
    });

  const changeTaskAgent = (next: string | null) =>
    run(async () => {
      // Naming the main agent is the same as clearing: it does its own Tasks.
      const nextExecutor = next && next !== agentId ? next : null;
      if (nextExecutor === (taskAgentId ?? null)) return;
      await setGoalTaskAgent(goalId, nextExecutor);
    });

  return {
    executor: {
      agentId: taskAgentId,
      changeAgent: changeTaskAgent,
      changeModel: (next: ModelConfig) =>
        run(async () => {
          if (!executor.ready || executor.locked) return;
          await setGoalTaskModel(goalId, overrideOf(next, executor));
        }),
      heterogeneousType: executor.heterogeneousType,
      modelLocked: executor.locked,
      modelReady: executor.ready,
      model: {
        model: taskModel || executor.model || '',
        provider: taskProvider || executor.provider || '',
      },
    },
    planner: {
      agentId,
      changeAgent,
      changeModel: (next: ModelConfig) =>
        run(async () => {
          if (!planner.ready || planner.locked) return;
          await setGoalModel(goalId, overrideOf(next, planner));
        }),
      heterogeneousType: planner.heterogeneousType,
      modelLocked: planner.locked,
      modelReady: planner.ready,
      model: {
        model: planningModel || planner.model || '',
        provider: planningProvider || planner.provider || '',
      },
    },
  };
};
