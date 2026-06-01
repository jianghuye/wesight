import type {
  AgentTeamWorkflow,
  CoworkAgentEngine,
} from '@shared/cowork/constants';

export type AgentSource = 'custom' | 'preset';

export interface Agent {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  identity: string;
  model: string;
  agentEngine: CoworkAgentEngine;
  icon: string;
  skillIds: string[];
  enabled: boolean;
  isDefault: boolean;
  source: AgentSource;
  presetId: string;
  createdAt: number;
  updatedAt: number;
}

export interface PresetAgent {
  id: string;
  name: string;
  nameEn: string;
  icon: string;
  description: string;
  descriptionEn: string;
  systemPrompt: string;
  systemPromptEn: string;
  skillIds: string[];
  installed: boolean;
}

export interface CreateAgentRequest {
  id?: string;
  name: string;
  description?: string;
  systemPrompt?: string;
  identity?: string;
  model?: string;
  agentEngine?: CoworkAgentEngine;
  icon?: string;
  skillIds?: string[];
  source?: string;
  presetId?: string;
}

export interface UpdateAgentRequest {
  name?: string;
  description?: string;
  systemPrompt?: string;
  identity?: string;
  model?: string;
  agentEngine?: CoworkAgentEngine;
  icon?: string;
  skillIds?: string[];
  enabled?: boolean;
}

export interface AgentTeamMember {
  agentId: string;
  role: string;
  order: number;
}

export interface AgentTeam {
  id: string;
  name: string;
  description: string;
  icon: string;
  leadAgentId: string;
  members: AgentTeamMember[];
  defaultWorkflow: AgentTeamWorkflow;
  skillIds: string[];
  enabled: boolean;
  source: AgentSource;
  presetId: string;
  createdAt: number;
  updatedAt: number;
}

export interface PresetAgentTeam {
  id: string;
  name: string;
  nameEn: string;
  icon: string;
  description: string;
  descriptionEn: string;
  members: AgentTeamMember[];
  leadAgentId: string;
  skillIds: string[];
  installed: boolean;
}

export interface CreateAgentTeamRequest {
  id?: string;
  name: string;
  description?: string;
  icon?: string;
  leadAgentId?: string;
  members?: AgentTeamMember[];
  defaultWorkflow?: AgentTeamWorkflow;
  skillIds?: string[];
  source?: AgentSource;
  presetId?: string;
}

export interface UpdateAgentTeamRequest {
  name?: string;
  description?: string;
  icon?: string;
  leadAgentId?: string;
  members?: AgentTeamMember[];
  defaultWorkflow?: AgentTeamWorkflow;
  skillIds?: string[];
  enabled?: boolean;
}
