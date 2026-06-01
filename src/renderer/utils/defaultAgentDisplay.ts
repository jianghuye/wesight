import { DefaultAgent } from '@shared/cowork/constants';

import { i18nService } from '../services/i18n';

type AgentDisplayLike = {
  id: string;
  name: string;
  icon?: string | null;
};

export const DEFAULT_AGENT_SELECT_ICON = '🤖';

export const isDefaultAgent = (agentId: string | null | undefined): boolean => (
  agentId === DefaultAgent.Id
);

export const getAgentDisplayName = (agent: AgentDisplayLike): string => (
  isDefaultAgent(agent.id) ? i18nService.t('defaultAgentName') : agent.name
);

export const getAgentSelectIcon = (agent: AgentDisplayLike): string => (
  isDefaultAgent(agent.id) ? DEFAULT_AGENT_SELECT_ICON : (agent.icon ?? '')
);
