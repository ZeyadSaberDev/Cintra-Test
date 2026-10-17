/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useGoalAgentModel } from './useGoalAgentModel';

const mocks = vi.hoisted(() => ({
  config: {} as {
    model?: string;
    provider?: string;
    taskAgentId?: string;
    taskModel?: string;
    taskProvider?: string;
  },
  navigate: vi.fn(),
  setGoalAgent: vi.fn(),
  setGoalModel: vi.fn(),
  setGoalTaskAgent: vi.fn(),
  setGoalTaskModel: vi.fn(),
}));

vi.mock('@/store/goal', () => ({
  goalSelectors: {
    goalGraph: () => () => ({ goal: { agentId: 'agt_old', config: mocks.config } }),
  },
  useGoalStore: (selector: (s: any) => unknown) =>
    selector({
      setGoalAgent: mocks.setGoalAgent,
      setGoalModel: mocks.setGoalModel,
      setGoalTaskAgent: mocks.setGoalTaskAgent,
      setGoalTaskModel: mocks.setGoalTaskModel,
    }),
}));

vi.mock('@/store/agent', () => ({
  useAgentStore: (selector: (s: any) => unknown) => selector({ useHydrateAgentConfig: () => {} }),
}));

vi.mock('@/store/agent/selectors', () => ({
  agentByIdSelectors: {
    getAgentModelById: (id: string) => () => (id === 'agt_exec' ? 'deepseek-chat' : 'gpt-4o-mini'),
    getAgentModelProviderById: (id: string) => () => (id === 'agt_exec' ? 'deepseek' : 'openai'),
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

    await act(() => result.current.planner.changeAgent('agt_new'));

    expect(mocks.setGoalAgent).toHaveBeenCalledWith('goal_1', 'agt_new');
    expect(mocks.navigate).toHaveBeenCalledWith('/agent/agt_new/goal/goal_1', { replace: true });
  });

  it('stays on an agent-less route after a handover', async () => {
    const { result } = renderHook(() => useGoalAgentModel({ goalId: 'goal_1' }));

    await act(() => result.current.planner.changeAgent('agt_new'));

    expect(mocks.setGoalAgent).toHaveBeenCalledWith('goal_1', 'agt_new');
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("shows the agent's own model until the goal overrides it", () => {
    const { result, rerender } = renderHook(() => useGoalAgentModel({ goalId: 'goal_1' }));
    expect(result.current.planner.model).toEqual({ model: 'gpt-4o-mini', provider: 'openai' });

    mocks.config = { model: 'gemini-3.8-flash', provider: 'google' };
    rerender();
    expect(result.current.planner.model).toEqual({ model: 'gemini-3.8-flash', provider: 'google' });
  });

  it("stores an override, and clears it when the agent's own model is picked", async () => {
    const { result } = renderHook(() => useGoalAgentModel({ goalId: 'goal_1' }));

    await act(() =>
      result.current.planner.changeModel({ model: 'gemini-3.8-flash', provider: 'google' }),
    );
    expect(mocks.setGoalModel).toHaveBeenLastCalledWith('goal_1', {
      model: 'gemini-3.8-flash',
      provider: 'google',
    });

    await act(() =>
      result.current.planner.changeModel({ model: 'gpt-4o-mini', provider: 'openai' }),
    );
    expect(mocks.setGoalModel).toHaveBeenLastCalledWith('goal_1', null);
  });

  it('routes Tasks to a dedicated executor, and back when the main agent is picked', async () => {
    const { result, rerender } = renderHook(() => useGoalAgentModel({ goalId: 'goal_1' }));

    await act(() => result.current.executor.changeAgent('agt_exec'));
    expect(mocks.setGoalTaskAgent).toHaveBeenLastCalledWith('goal_1', 'agt_exec');

    mocks.config = { taskAgentId: 'agt_exec' };
    rerender();
    expect(result.current.executor.agentId).toBe('agt_exec');

    await act(() => result.current.executor.changeAgent('agt_old'));
    expect(mocks.setGoalTaskAgent).toHaveBeenLastCalledWith('goal_1', null);
  });

  it('skips the write when the executor does not change', async () => {
    const { result } = renderHook(() => useGoalAgentModel({ goalId: 'goal_1' }));

    // No dedicated executor yet, so picking the main agent changes nothing.
    await act(() => result.current.executor.changeAgent('agt_old'));
    expect(mocks.setGoalTaskAgent).not.toHaveBeenCalled();
  });

  it("shows the executor's own model, falling back to the main agent's", () => {
    const { result, rerender } = renderHook(() => useGoalAgentModel({ goalId: 'goal_1' }));
    expect(result.current.executor.model).toEqual({ model: 'gpt-4o-mini', provider: 'openai' });

    mocks.config = { taskAgentId: 'agt_exec' };
    rerender();
    expect(result.current.executor.model).toEqual({ model: 'deepseek-chat', provider: 'deepseek' });

    mocks.config = {
      taskAgentId: 'agt_exec',
      taskModel: 'gemini-3.8-flash',
      taskProvider: 'google',
    };
    rerender();
    expect(result.current.executor.model).toEqual({
      model: 'gemini-3.8-flash',
      provider: 'google',
    });
  });

  it("stores a Task model, and clears it when the executor's own model is picked", async () => {
    mocks.config = { taskAgentId: 'agt_exec' };
    const { result } = renderHook(() => useGoalAgentModel({ goalId: 'goal_1' }));

    await act(() =>
      result.current.executor.changeModel({ model: 'gemini-3.8-flash', provider: 'google' }),
    );
    expect(mocks.setGoalTaskModel).toHaveBeenLastCalledWith('goal_1', {
      model: 'gemini-3.8-flash',
      provider: 'google',
    });

    await act(() =>
      result.current.executor.changeModel({ model: 'deepseek-chat', provider: 'deepseek' }),
    );
    expect(mocks.setGoalTaskModel).toHaveBeenLastCalledWith('goal_1', null);
  });
});
