import { AgentTeamWorkflow, CoworkAgentEngine } from '../shared/cowork/constants';
import type {
  Agent,
  AgentTeam,
  CoworkStore,
  CreateAgentRequest,
  CreateAgentTeamRequest,
  UpdateAgentRequest,
  UpdateAgentTeamRequest,
} from './coworkStore';
import { PRESET_AGENTS, type PresetAgent,presetToCreateRequest } from './presetAgents';

/**
 * AgentManager handles CRUD operations for agents and preset agent installation.
 * Agents are stored in the SQLite `agents` table via CoworkStore.
 */
export class AgentManager {
  private store: CoworkStore;

  constructor(store: CoworkStore) {
    this.store = store;
  }

  listAgents(): Agent[] {
    return this.store.listAgents();
  }

  getAgent(agentId: string): Agent | null {
    return this.store.getAgent(agentId);
  }

  getDefaultAgent(): Agent {
    const agents = this.store.listAgents();
    return agents.find(a => a.isDefault) || agents[0];
  }

  createAgent(request: CreateAgentRequest): Agent {
    return this.store.createAgent(request);
  }

  updateAgent(agentId: string, updates: UpdateAgentRequest): Agent | null {
    return this.store.updateAgent(agentId, updates);
  }

  deleteAgent(agentId: string): boolean {
    return this.store.deleteAgent(agentId);
  }

  listAgentTeams(): AgentTeam[] {
    return this.store.listAgentTeams();
  }

  getAgentTeam(teamId: string): AgentTeam | null {
    return this.store.getAgentTeam(teamId);
  }

  createAgentTeam(request: CreateAgentTeamRequest): AgentTeam {
    return this.store.createAgentTeam(request);
  }

  updateAgentTeam(teamId: string, updates: UpdateAgentTeamRequest): AgentTeam | null {
    return this.store.updateAgentTeam(teamId, updates);
  }

  deleteAgentTeam(teamId: string): boolean {
    return this.store.deleteAgentTeam(teamId);
  }

  // --- Preset agents ---

  getPresetAgents(): PresetAgent[] {
    const existingAgents = this.store.listAgents();
    const existingPresetIds = new Set(
      existingAgents.filter(a => a.source === 'preset').map(a => a.presetId)
    );
    // Only return presets that haven't been added yet
    return PRESET_AGENTS.filter(p => !existingPresetIds.has(p.id));
  }

  getAllPresetAgents(): PresetAgent[] {
    return PRESET_AGENTS;
  }

  addPresetAgent(presetId: string): Agent | null {
    const preset = PRESET_AGENTS.find(p => p.id === presetId);
    if (!preset) return null;

    // Check if already installed
    const existing = this.store.getAgent(preset.id);
    if (existing) return existing;

    return this.store.createAgent(presetToCreateRequest(preset));
  }

  installDevelopmentTeamTemplate(): AgentTeam {
    const members = [
      this.ensureTemplateAgent({
        id: 'team-product-manager',
        name: '产品经理',
        description: '负责需求澄清、范围拆解和验收标准。',
        icon: '🧭',
        agentEngine: CoworkAgentEngine.ClaudeCode,
        systemPrompt: [
          '你是开发团队中的产品经理。',
          '你的职责是澄清需求、拆分任务、识别风险，并输出清晰的验收标准。',
          '请保持简洁，优先给开发工程师可执行的任务拆解。',
        ].join('\n'),
      }),
      this.ensureTemplateAgent({
        id: 'team-developer',
        name: '开发工程师',
        description: '负责阅读代码、实现需求、修改文件和解释关键变更。',
        icon: '💻',
        agentEngine: CoworkAgentEngine.Codex,
        systemPrompt: [
          '你是开发团队中的开发工程师。',
          '你的职责是理解需求、阅读现有代码、做最小必要实现，并说明关键文件变更。',
          '完成后给测试工程师留下可验证的检查点。',
        ].join('\n'),
      }),
      this.ensureTemplateAgent({
        id: 'team-test-engineer',
        name: '测试工程师',
        description: '负责验证变更、回归风险和测试建议。',
        icon: '🧪',
        agentEngine: CoworkAgentEngine.Codex,
        systemPrompt: [
          '你是开发团队中的测试工程师。',
          '你的职责是验证开发结果、运行可用测试、指出回归风险，并给出下一步验证建议。',
          '如果无法运行测试，请说明原因和人工验证路径。',
        ].join('\n'),
      }),
    ];

    const existing = this.store.getAgentTeam('development-team');
    const teamRequest: CreateAgentTeamRequest = {
      id: 'development-team',
      name: '开发团队',
      description: '产品经理、开发工程师、测试工程师串行协作。',
      icon: '👥',
      leadAgentId: members[0].id,
      members: members.map((agent, index) => ({
        agentId: agent.id,
        role: index === 0 ? '产品经理' : index === 1 ? '开发工程师' : '测试工程师',
        order: index,
      })),
      defaultWorkflow: AgentTeamWorkflow.LeadSequential,
      source: 'preset',
      presetId: 'development-team',
    };

    if (existing) {
      return this.store.updateAgentTeam(existing.id, teamRequest) || existing;
    }
    return this.store.createAgentTeam(teamRequest);
  }

  private ensureTemplateAgent(input: {
    id: string;
    name: string;
    description: string;
    icon: string;
    systemPrompt: string;
    agentEngine: CoworkAgentEngine;
  }): Agent {
    const existing = this.store.getAgent(input.id);
    const request: CreateAgentRequest = {
      id: input.id,
      name: input.name,
      description: input.description,
      icon: input.icon,
      systemPrompt: input.systemPrompt,
      agentEngine: input.agentEngine,
      source: 'preset',
      presetId: input.id,
    };
    if (existing) {
      return this.store.updateAgent(input.id, request) || existing;
    }
    return this.store.createAgent(request);
  }
}
