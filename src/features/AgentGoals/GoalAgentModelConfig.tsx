import { Block, cssVar, Flexbox, Text, Tooltip, useThemeMode } from '@lobehub/ui';
import { useTranslation } from 'react-i18next';

import AssigneeAgentSelector from '@/features/AgentTasks/features/AssigneeAgentSelector';
import AssigneeAvatar from '@/features/AgentTasks/features/AssigneeAvatar';
import { useAgentDisplayMeta } from '@/features/AgentTasks/shared/useAgentDisplayMeta';
import HeterogeneousTag from '@/features/HeterogeneousTag';
import ModelSelect from '@/features/ModelSelect';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/selectors';

import { useGoalAgentModel } from './useGoalAgentModel';

interface AgentPillProps {
  agentId?: string;
  disabled?: boolean;
  /** Names the role, since the planner and executor pills sit side by side. */
  label: string;
  onChange: (agentId: string | null) => void;
  /** Shown instead of an agent when the slot falls back to another one. */
  placeholder?: string;
  tooltip: string;
}

const AgentPill = ({
  agentId,
  disabled,
  label,
  onChange,
  placeholder,
  tooltip,
}: AgentPillProps) => {
  const { isDarkMode } = useThemeMode();
  const meta = useAgentDisplayMeta(agentId);
  const heterogeneousType = useHomeStore(
    (s) => homeAgentListSelectors.getAgentById(agentId ?? '')(s)?.heterogeneousType,
  );

  return (
    <AssigneeAgentSelector
      allowUnassigned={false}
      currentAgentId={agentId}
      disabled={disabled}
      onChange={onChange}
    >
      <Tooltip title={tooltip}>
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
          <Text style={{ color: cssVar.colorTextDescription }}>{label}</Text>
          {agentId ? (
            <>
              <AssigneeAvatar agentId={agentId} size={20} />
              <Text ellipsis weight={500}>
                {meta?.title}
              </Text>
              <HeterogeneousTag type={heterogeneousType} />
            </>
          ) : (
            <Text style={{ color: cssVar.colorTextDescription }} weight={500}>
              {placeholder}
            </Text>
          )}
        </Block>
      </Tooltip>
    </AssigneeAgentSelector>
  );
};

interface GoalAgentModelConfigProps {
  /** Only the goal's owner may hand it over, the same rule as restart. */
  disabled?: boolean;
  goalId: string;
  /** The agent the page route is scoped to; see `useGoalAgentModel`. */
  routeAgentId?: string;
}

/**
 * Who plans the goal and on which model, and who does its Tasks — like a Task's
 * assignee and model. The model only drives planning turns; Tasks keep their own.
 */
const GoalAgentModelConfig = ({ disabled, goalId, routeAgentId }: GoalAgentModelConfigProps) => {
  const { t } = useTranslation('chat');
  const {
    agentId,
    changeAgent,
    changeModel,
    changeTaskAgent,
    heterogeneousType,
    model,
    taskAgentId,
  } = useGoalAgentModel({ goalId, routeAgentId });

  return (
    <Flexbox horizontal align={'center'} gap={8} style={{ minWidth: 0 }} wrap={'wrap'}>
      <AgentPill
        agentId={agentId}
        disabled={disabled}
        label={t('goalDetail.mainAgentLabel')}
        tooltip={t('goalDetail.mainAgent')}
        onChange={changeAgent}
      />
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
      <AgentPill
        agentId={taskAgentId}
        disabled={disabled}
        label={t('goalDetail.taskAgentLabel')}
        placeholder={t('goalDetail.taskAgentFollowsMain')}
        tooltip={t('goalDetail.taskAgent')}
        onChange={changeTaskAgent}
      />
    </Flexbox>
  );
};

export default GoalAgentModelConfig;
