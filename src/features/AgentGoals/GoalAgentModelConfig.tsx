import {
  ActionIcon,
  Block,
  cssVar,
  Flexbox,
  Popover,
  Text,
  Tooltip,
  useThemeMode,
} from '@lobehub/ui';
import { Settings2Icon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import AssigneeAgentSelector from '@/features/AgentTasks/features/AssigneeAgentSelector';
import AssigneeAvatar from '@/features/AgentTasks/features/AssigneeAvatar';
import { useAgentDisplayMeta } from '@/features/AgentTasks/shared/useAgentDisplayMeta';
import HeterogeneousTag from '@/features/HeterogeneousTag';
import ModelSelect from '@/features/ModelSelect';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/selectors';

import { useGoalAgentModel } from './useGoalAgentModel';

type ModelConfig = { model: string; provider: string };

interface AgentPillProps {
  agentId?: string;
  disabled?: boolean;
  /** Names the role, since the planner and executor pills sit side by side. */
  label: string;
  /** The model this role runs on, behind the pill's settings button. */
  model?: { onChange: (next: ModelConfig) => void; title: string; value: ModelConfig };
  onChange: (agentId: string | null) => void;
  /** Shown instead of an agent when the slot falls back to another one. */
  placeholder?: string;
  tooltip: string;
}

const AgentPill = ({
  agentId,
  disabled,
  label,
  model,
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
    <Block
      horizontal
      align={'center'}
      gap={2}
      padding={2}
      style={{ flex: 'none', maxWidth: '100%', minHeight: 32 }}
      variant={isDarkMode ? 'filled' : 'outlined'}
    >
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
            paddingBlock={2}
            paddingInline={8}
            style={{ minHeight: 26 }}
            variant={'borderless'}
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
      {model && (
        <Popover
          placement={'bottomLeft'}
          trigger={'click'}
          content={
            <Flexbox gap={8}>
              <Text fontSize={12} type={'secondary'}>
                {model.title}
              </Text>
              <ModelSelect
                initialWidth
                disabled={disabled}
                popupWidth={400}
                value={model.value}
                onChange={model.onChange}
              />
            </Flexbox>
          }
        >
          <ActionIcon icon={Settings2Icon} size={'small'} title={model.title} />
        </Popover>
      )}
    </Block>
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
 * Who plans the goal and who does its Tasks, each with the model it runs on
 * behind a settings button — like a Task's assignee and model.
 */
const GoalAgentModelConfig = ({ disabled, goalId, routeAgentId }: GoalAgentModelConfigProps) => {
  const { t } = useTranslation('chat');
  const { executor, planner } = useGoalAgentModel({ goalId, routeAgentId });

  return (
    <Flexbox horizontal align={'center'} gap={8} style={{ minWidth: 0 }} wrap={'wrap'}>
      <AgentPill
        agentId={planner.agentId}
        disabled={disabled}
        label={t('goalDetail.mainAgentLabel')}
        tooltip={t('goalDetail.mainAgent')}
        // An external runtime brings its own model, not a provider model.
        model={
          planner.agentId && !planner.heterogeneousType
            ? {
                onChange: planner.changeModel,
                title: t('goalDetail.planningModel'),
                value: planner.model,
              }
            : undefined
        }
        onChange={planner.changeAgent}
      />
      <AgentPill
        agentId={executor.agentId}
        disabled={disabled}
        label={t('goalDetail.taskAgentLabel')}
        placeholder={t('goalDetail.taskAgentFollowsMain')}
        tooltip={t('goalDetail.taskAgent')}
        model={
          planner.agentId && !executor.heterogeneousType
            ? {
                onChange: executor.changeModel,
                title: t('goalDetail.taskModel'),
                value: executor.model,
              }
            : undefined
        }
        onChange={executor.changeAgent}
      />
    </Flexbox>
  );
};

export default GoalAgentModelConfig;
