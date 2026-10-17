import type { GoalItem } from '@lobechat/types';
import { TRPCError } from '@trpc/server';

import { AgentModel } from '@/database/models/agent';
import { GoalModel } from '@/database/models/goal';
import { GoalGraphModel } from '@/database/models/goalGraph';
import { TaskModel } from '@/database/models/task';
import type { LobeChatDatabase } from '@/database/type';
import { assertAgentUsableBy } from '@/database/utils/agent-access';

import { GoalManagerService } from './manager';

/** Who does the goal's Tasks: its dedicated executor, else the goal agent itself. */
export const goalTaskAgentId = (goal: Pick<GoalItem, 'agentId' | 'config'>) =>
  goal.config?.taskAgentId ?? goal.agentId ?? undefined;

const goalNotFound = () => new TRPCError({ code: 'NOT_FOUND', message: 'Goal not found' });

/**
 * Who works on a goal and with which model: the goal agent that supervises and
 * plans, the executor its Tasks go to, and the model planning turns run on.
 */
export class GoalAssignmentService {
  private agentModel: AgentModel;
  private goalModel: GoalModel;
  private graphModel: GoalGraphModel;
  private taskModel: TaskModel;

  constructor(
    private db: LobeChatDatabase,
    private userId: string,
    private workspaceId?: string,
  ) {
    this.agentModel = new AgentModel(db, userId, workspaceId);
    this.goalModel = new GoalModel(db, userId, workspaceId);
    this.graphModel = new GoalGraphModel(db, userId, workspaceId);
    this.taskModel = new TaskModel(db, userId, workspaceId);
  }

  private assertUsable = (agentId: string) =>
    assertAgentUsableBy(this.db, agentId, { userId: this.userId, workspaceId: this.workspaceId });

  /**
   * Hand the goal to a different agent. The goal agent supervises: it owns the
   * goal page and list entry and runs every planning turn. When it also does
   * the goal's own Tasks (no separate `taskAgentId`), every Task the
   * coordinator creates from here on goes to the new agent and — unless the
   * caller opts out — the unfinished ones move with it. A goal whose Tasks go
   * to a dedicated executor keeps them there; see `setTaskAgent`.
   *
   * The management conversation moves with supervision: it lives in the goal
   * agent's own history, so it is re-created for the new agent here instead of
   * being left pointing at the previous agent's topic until the next claim.
   */
  setAgent = async (
    goalId: string,
    agentId: string,
    options?: { goalOnly?: boolean },
  ): Promise<{ goal: GoalItem; reassignedTaskIds: string[] }> => {
    await this.assertUsable(agentId);
    const previous = await this.goalModel.findById(goalId);
    if (!previous) throw goalNotFound();
    const updated = await this.goalModel.update(goalId, { agentId });
    if (!updated) throw goalNotFound();
    const goal = previous.agentId === agentId ? updated : await this.dropModelOverride(updated);

    // The receipt carries the management topic, so the caller must get the row
    // with the migrated one — not the copy read before the handoff.
    const migrated = await new GoalManagerService(
      this.db,
      this.userId,
      this.workspaceId,
    ).moveConversationTo(goalId, agentId);

    const reassignedTaskIds = await this.followGoalAgent(goal, agentId, options?.goalOnly);
    return {
      goal: migrated ? ((await this.goalModel.findById(goalId)) ?? goal) : goal,
      reassignedTaskIds,
    };
  };

  /**
   * Pick the model the goal agent plans with, or fall back to that agent's own
   * model with `null`. Only planning turns read it — Tasks keep their own model
   * — and a turn already running keeps the model it started on.
   */
  setModel = async (
    goalId: string,
    modelConfig: { model: string; provider: string } | null,
  ): Promise<GoalItem> => {
    const goal = await this.goalModel.updateModelConfig(goalId, modelConfig);
    if (!goal) throw goalNotFound();
    return goal;
  };

  /**
   * A model override was picked against the previous agent — its provider, or a
   * runtime that agent does not share — so a new goal agent starts from its own.
   */
  dropModelOverride = async (goal: GoalItem) =>
    goal.config?.model || goal.config?.provider
      ? ((await this.goalModel.updateModelConfig(goal.id, null)) ?? goal)
      : goal;

  /**
   * After the goal agent changed: when that agent also does the goal's Tasks,
   * unfinished ones follow it unless the caller keeps them (`goalOnly`). A goal
   * with a dedicated executor keeps its Tasks there.
   */
  followGoalAgent = async (
    goal: Pick<GoalItem, 'config' | 'id'>,
    agentId: string,
    goalOnly?: boolean,
  ) => (goalOnly || goal.config?.taskAgentId ? [] : this.reassignUnfinishedTasks(goal.id, agentId));

  /**
   * Route the goal's Tasks to a dedicated executor, or back to the goal agent
   * with `null`. The goal agent keeps supervising either way. Unfinished Tasks
   * move with the change unless the caller opts out.
   */
  setTaskAgent = async (
    goalId: string,
    agentId: string | null,
    options?: { goalOnly?: boolean },
  ): Promise<{ goal: GoalItem; reassignedTaskIds: string[] }> => {
    if (agentId) await this.assertUsable(agentId);
    const current = await this.goalModel.findById(goalId);
    if (!current) throw goalNotFound();
    // Naming the goal agent itself is the same as clearing: one agent, one slot.
    const goal = await this.goalModel.updateTaskAgentId(
      goalId,
      agentId && agentId !== current.agentId ? agentId : null,
    );
    if (!goal) throw goalNotFound();

    const assignee = goalTaskAgentId(goal);
    const reassignedTaskIds =
      options?.goalOnly || !assignee ? [] : await this.reassignUnfinishedTasks(goalId, assignee);
    return { goal, reassignedTaskIds };
  };

  /**
   * The agent the next coordinator-created Task goes to.
   *
   * `taskAgentId` lives in JSON, so deleting the executor does not null it the
   * way the `agent_id` foreign key is nulled. Handing that stale id to
   * `createTask` fails with NOT_FOUND on every tick and the goal can never
   * create work again — so a missing executor falls back to the goal agent.
   */
  resolveTaskAssignee = async (goal: GoalItem) => {
    const taskAgentId = goal.config?.taskAgentId;
    if (taskAgentId && !(await this.agentModel.existsById(taskAgentId)))
      return goal.agentId ?? undefined;
    return goalTaskAgentId(goal);
  };

  /**
   * Snapshot the graph AFTER the goal row moved: a task the coordinator binds
   * later inherits the new assignee from the goal, and a task bound before is in
   * this snapshot — so no concurrently created task can slip through the
   * handoff still pointing at the previous agent. A Task mid-run keeps its
   * current operation; `runTask` reads the assignee at its next dispatch.
   */
  private reassignUnfinishedTasks = async (goalId: string, agentId: string) => {
    const graph = await this.graphModel.getGraph(goalId);
    if (!graph) throw goalNotFound();
    const taskIds = graph.nodes.flatMap((node) => (node.taskId ? [node.taskId] : []));
    const reassigned: string[] = [];
    for (const task of await this.taskModel.findByIds(taskIds)) {
      if (task.status === 'completed' || task.status === 'canceled') continue;
      if (task.assigneeAgentId === agentId) continue;
      await this.taskModel.update(task.id, { assigneeAgentId: agentId });
      reassigned.push(task.id);
    }
    return reassigned;
  };
}
