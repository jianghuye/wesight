import { store } from '../store';
import {
  addAgent,
  addTeam,
  removeAgent,
  removeTeam,
  setAgents,
  setCurrentAgentId,
  setCurrentTeamId,
  setLoading,
  setTeams,
  updateAgent as updateAgentAction,
  updateTeam as updateTeamAction,
} from '../store/slices/agentSlice';
import { clearCurrentSession } from '../store/slices/coworkSlice';
import { clearActiveSkills,setActiveSkillIds } from '../store/slices/skillSlice';
import type {
  Agent,
  AgentTeam,
  CreateAgentTeamRequest,
  PresetAgent,
  UpdateAgentTeamRequest,
} from '../types/agent';

const toAgentSummary = (agent: Agent) => ({
  id: agent.id,
  name: agent.name,
  description: agent.description,
  icon: agent.icon,
  agentEngine: agent.agentEngine,
  enabled: agent.enabled,
  isDefault: agent.isDefault,
  source: agent.source,
  skillIds: agent.skillIds ?? [],
});

class AgentService {
  async loadAgents(): Promise<void> {
    store.dispatch(setLoading(true));
    try {
      const agents = await window.electron?.agents?.list();
      if (agents) {
        store.dispatch(setAgents(agents.map(toAgentSummary)));
      }
      const teams = await window.electron?.agents?.listTeams?.();
      if (teams) {
        store.dispatch(setTeams(teams));
      }
    } catch (error) {
      console.error('Failed to load agents:', error);
    } finally {
      store.dispatch(setLoading(false));
    }
  }

  async createAgent(request: {
    name: string;
    description?: string;
    systemPrompt?: string;
    identity?: string;
    model?: string;
    icon?: string;
    agentEngine?: Agent['agentEngine'];
    skillIds?: string[];
  }): Promise<Agent | null> {
    try {
      const agent = await window.electron?.agents?.create(request);
      if (agent) {
        store.dispatch(addAgent(toAgentSummary(agent)));
        return agent;
      }
      return null;
    } catch (error) {
      console.error('Failed to create agent:', error);
      return null;
    }
  }

  async updateAgent(id: string, updates: {
    name?: string;
    description?: string;
    systemPrompt?: string;
    identity?: string;
    model?: string;
    icon?: string;
    agentEngine?: Agent['agentEngine'];
    skillIds?: string[];
    enabled?: boolean;
  }): Promise<Agent | null> {
    try {
      const agent = await window.electron?.agents?.update(id, updates);
      if (agent) {
        store.dispatch(updateAgentAction({
          id: agent.id,
          updates: toAgentSummary(agent),
        }));
        return agent;
      }
      return null;
    } catch (error) {
      console.error('Failed to update agent:', error);
      return null;
    }
  }

  async deleteAgent(id: string): Promise<boolean> {
    try {
      const wasCurrentAgent = store.getState().agent.currentAgentId === id;
      await window.electron?.agents?.delete(id);
      store.dispatch(removeAgent(id));
      if (wasCurrentAgent) {
        this.switchAgent('main');
        const { coworkService } = await import('./cowork');
        coworkService.loadSessions('main');
      }
      return true;
    } catch (error) {
      console.error('Failed to delete agent:', error);
      return false;
    }
  }

  async getPresets(): Promise<PresetAgent[]> {
    try {
      const presets = await window.electron?.agents?.presets();
      return presets ?? [];
    } catch (error) {
      console.error('Failed to get presets:', error);
      return [];
    }
  }

  async addPreset(presetId: string): Promise<Agent | null> {
    try {
      const agent = await window.electron?.agents?.addPreset(presetId);
      if (agent) {
        store.dispatch(addAgent(toAgentSummary(agent)));
        return agent;
      }
      return null;
    } catch (error) {
      console.error('Failed to add preset agent:', error);
      return null;
    }
  }

  switchAgent(agentId: string): void {
    store.dispatch(setCurrentAgentId(agentId));
    store.dispatch(clearCurrentSession());
    const agent = store.getState().agent.agents.find((a) => a.id === agentId);
    if (agent?.skillIds?.length) {
      store.dispatch(setActiveSkillIds(agent.skillIds));
    } else {
      store.dispatch(clearActiveSkills());
    }
  }

  async createTeam(request: CreateAgentTeamRequest): Promise<AgentTeam | null> {
    try {
      const team = await window.electron?.agents?.createTeam?.(request);
      if (team) {
        store.dispatch(addTeam(team));
        return team;
      }
      return null;
    } catch (error) {
      console.error('Failed to create team:', error);
      return null;
    }
  }

  async updateTeam(id: string, updates: UpdateAgentTeamRequest): Promise<AgentTeam | null> {
    try {
      const team = await window.electron?.agents?.updateTeam?.(id, updates);
      if (team) {
        store.dispatch(updateTeamAction({ id: team.id, updates: team }));
        return team;
      }
      return null;
    } catch (error) {
      console.error('Failed to update team:', error);
      return null;
    }
  }

  async deleteTeam(id: string): Promise<boolean> {
    try {
      await window.electron?.agents?.deleteTeam?.(id);
      store.dispatch(removeTeam(id));
      return true;
    } catch (error) {
      console.error('Failed to delete team:', error);
      return false;
    }
  }

  async installDevelopmentTeamTemplate(): Promise<AgentTeam | null> {
    try {
      const team = await window.electron?.agents?.installDevelopmentTeam?.();
      if (team) {
        await this.loadAgents();
        return team;
      }
      return null;
    } catch (error) {
      console.error('Failed to install development team:', error);
      return null;
    }
  }

  switchTeam(teamId: string): void {
    store.dispatch(setCurrentTeamId(teamId));
    store.dispatch(clearCurrentSession());
    const team = store.getState().agent.teams.find((item) => item.id === teamId);
    if (team?.skillIds?.length) {
      store.dispatch(setActiveSkillIds(team.skillIds));
    } else {
      store.dispatch(clearActiveSkills());
    }
  }
}

export const agentService = new AgentService();
