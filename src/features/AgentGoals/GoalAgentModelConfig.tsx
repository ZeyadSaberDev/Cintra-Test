import { Block, Flexbox, Text, toast, Tooltip, useThemeMode } from '@lobehub/ui';
import { useTranslation } from 'react-i18next';

import AssigneeAgentSelector from '@/features/AgentTasks/features/AssigneeAgentSelector';
import AssigneeAvatar from '@/features/AgentTasks/features/AssigneeAvatar';
import { useAgentDisplayMeta } from '@/features/AgentTasks/shared/useAgentDisplayMeta';
import HeterogeneousTag from '@/features/HeterogeneousTag';
import ModelSelect from '@/features/ModelSelect';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';
import { goalSelectors, useGoalStore } from '@/store/goal';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/selectors';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/selectors';

interface GoalAgentModelConfigProps {
  /** Only the goal's owner may hand it over, the same rule as restart. */
  disabled?: boolean;
  goalId: string;
}

/**
 * The goal's main agent and the model it plans with, side by side like a Task's
 * assignee and model. The model only drives planning turns; Tasks keep their own.
 */
const GoalAgentModelConfig = ({ disabled, goalId }: GoalAgentModelConfigProps) => {
  const { t } = useTranslation('chat');
  const { isDarkMode } = useThemeMode();
  const agentId = useGoalStore((s) => goalSelectors.goalGraph(goalId)(s)?.goal.agentId);
  const goalModel = useGoalStore((s) => goalSelectors.goalGraph(goalId)(s)?.goal.config?.model);
  const goalProvider = useGoalStore(
    (s) => goalSelectors.goalGraph(goalId)(s)?.goal.config?.provider,
  );
  const setGoalAgent = useGoalStore((s) => s.setGoalAgent);
  const setGoalModel = useGoalStore((s) => s.setGoalModel);
  const agentMeta = useAgentDisplayMeta(agentId ?? undefined);
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

  const handleAgentChange = async (next: string | null) => {
    if (!next) return;
    try {
      await setGoalAgent(goalId, next);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleModelChange = async (next: { model: string; provider: string }) => {
    // Picking the agent's own model is the same as not overriding it, and keeps
    // the goal following that agent when its model changes later.
    const isAgentDefault = next.model === agentModel && next.provider === agentProvider;
    try {
      await setGoalModel(goalId, isAgentDefault ? null : next);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <Flexbox horizontal align={'center'} gap={8} style={{ minWidth: 0 }}>
      <AssigneeAgentSelector
        allowUnassigned={false}
        currentAgentId={agentId}
        disabled={disabled}
        onChange={handleAgentChange}
      >
        <Tooltip title={t('goalDetail.mainAgent')}>
          <Block
            clickable
            horizontal
            align={'center'}
            gap={8}
            paddingBlock={4}
            paddingInline={11}
            style={{ flex: 'none', maxWidth: '100%', minHeight: 32 }}
            variant={isDarkMode ? 'filled' : 'outlined'}
          >
            {agentId && <AssigneeAvatar agentId={agentId} size={20} />}
            <Text ellipsis weight={500}>
              {agentMeta?.title}
            </Text>
            <HeterogeneousTag type={heterogeneousType} />
          </Block>
        </Tooltip>
      </AssigneeAgentSelector>
      {/* An external runtime brings its own model, not a provider model. */}
      {agentId && !heterogeneousType && (
        <Tooltip title={t('goalDetail.planningModel')}>
          <div>
            <ModelSelect
              initialWidth
              disabled={disabled}
              popupWidth={400}
              value={{
                model: goalModel || agentModel || '',
                provider: goalProvider || agentProvider || '',
              }}
              onChange={handleModelChange}
            />
          </div>
        </Tooltip>
      )}
    </Flexbox>
  );
};

export default GoalAgentModelConfig;
