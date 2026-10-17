import { Block, Flexbox, Text, Tooltip, useThemeMode } from '@lobehub/ui';
import { useTranslation } from 'react-i18next';

import AssigneeAgentSelector from '@/features/AgentTasks/features/AssigneeAgentSelector';
import AssigneeAvatar from '@/features/AgentTasks/features/AssigneeAvatar';
import { useAgentDisplayMeta } from '@/features/AgentTasks/shared/useAgentDisplayMeta';
import HeterogeneousTag from '@/features/HeterogeneousTag';
import ModelSelect from '@/features/ModelSelect';

import { useGoalAgentModel } from './useGoalAgentModel';

interface GoalAgentModelConfigProps {
  /** Only the goal's owner may hand it over, the same rule as restart. */
  disabled?: boolean;
  goalId: string;
  /** The agent the page route is scoped to; see `useGoalAgentModel`. */
  routeAgentId?: string;
}

/**
 * The goal's main agent and the model it plans with, side by side like a Task's
 * assignee and model. The model only drives planning turns; Tasks keep their own.
 */
const GoalAgentModelConfig = ({ disabled, goalId, routeAgentId }: GoalAgentModelConfigProps) => {
  const { t } = useTranslation('chat');
  const { isDarkMode } = useThemeMode();
  const { agentId, changeAgent, changeModel, heterogeneousType, model } = useGoalAgentModel({
    goalId,
    routeAgentId,
  });
  const agentMeta = useAgentDisplayMeta(agentId);

  return (
    <Flexbox horizontal align={'center'} gap={8} style={{ minWidth: 0 }}>
      <AssigneeAgentSelector
        allowUnassigned={false}
        currentAgentId={agentId}
        disabled={disabled}
        onChange={changeAgent}
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
              value={model}
              onChange={changeModel}
            />
          </div>
        </Tooltip>
      )}
    </Flexbox>
  );
};

export default GoalAgentModelConfig;
