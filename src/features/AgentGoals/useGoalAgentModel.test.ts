/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useGoalAgentModel } from './useGoalAgentModel';

const mocks = vi.hoisted(() => ({
  config: {} as { model?: string; provider?: string },
  navigate: vi.fn(),
  setGoalAgent: vi.fn(),
  setGoalModel: vi.fn(),
}));

vi.mock('@/store/goal', () => ({
  goalSelectors: {
    goalGraph: () => () => ({ goal: { agentId: 'agt_old', config: mocks.config } }),
  },
  useGoalStore: (selector: (s: any) => unknown) =>
    selector({ setGoalAgent: mocks.setGoalAgent, setGoalModel: mocks.setGoalModel }),
}));

vi.mock('@/store/agent', () => ({
  useAgentStore: (selector: (s: any) => unknown) => selector({ useHydrateAgentConfig: () => {} }),
}));

vi.mock('@/store/agent/selectors', () => ({
  agentByIdSelectors: {
    getAgentModelById: () => () => 'gpt-4o-mini',
    getAgentModelProviderById: () => () => 'openai',
  },
}));

vi.mock('@/store/home', () => ({ useHomeStore: (selector: (s: any) => unknown) => selector({}) }));
vi.mock('@/store/home/selectors', () => ({
  homeAgentListSelectors: { getAgentById: () => () => undefined },
}));
vi.mock('@/store/user', () => ({ useUserStore: () => true }));
vi.mock('@/store/user/selectors', () => ({ authSelectors: { isLogin: () => true } }));
vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => mocks.navigate,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.config = {};
});

describe('useGoalAgentModel', () => {
  it('follows the goal to the new agent route after a handover', async () => {
    const { result } = renderHook(() =>
      useGoalAgentModel({ goalId: 'goal_1', routeAgentId: 'agt_old' }),
    );

    await act(() => result.current.changeAgent('agt_new'));

    expect(mocks.setGoalAgent).toHaveBeenCalledWith('goal_1', 'agt_new');
    expect(mocks.navigate).toHaveBeenCalledWith('/agent/agt_new/goal/goal_1', { replace: true });
  });

  it('stays on an agent-less route after a handover', async () => {
    const { result } = renderHook(() => useGoalAgentModel({ goalId: 'goal_1' }));

    await act(() => result.current.changeAgent('agt_new'));

    expect(mocks.setGoalAgent).toHaveBeenCalledWith('goal_1', 'agt_new');
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("shows the agent's own model until the goal overrides it", () => {
    const { result, rerender } = renderHook(() => useGoalAgentModel({ goalId: 'goal_1' }));
    expect(result.current.model).toEqual({ model: 'gpt-4o-mini', provider: 'openai' });

    mocks.config = { model: 'gemini-3.8-flash', provider: 'google' };
    rerender();
    expect(result.current.model).toEqual({ model: 'gemini-3.8-flash', provider: 'google' });
  });

  it("stores an override, and clears it when the agent's own model is picked", async () => {
    const { result } = renderHook(() => useGoalAgentModel({ goalId: 'goal_1' }));

    await act(() => result.current.changeModel({ model: 'gemini-3.8-flash', provider: 'google' }));
    expect(mocks.setGoalModel).toHaveBeenLastCalledWith('goal_1', {
      model: 'gemini-3.8-flash',
      provider: 'google',
    });

    await act(() => result.current.changeModel({ model: 'gpt-4o-mini', provider: 'openai' }));
    expect(mocks.setGoalModel).toHaveBeenLastCalledWith('goal_1', null);
  });
});
