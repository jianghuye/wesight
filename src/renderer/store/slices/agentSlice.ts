import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { AgentRunTargetType, CoworkAgentEngine } from '@shared/cowork/constants';

import type { AgentTeam } from '../../types/agent';

interface AgentSummary {
  id: string;
  name: string;
  description: string;
  icon: string;
  agentEngine: CoworkAgentEngine;
  enabled: boolean;
  isDefault: boolean;
  source: 'custom' | 'preset';
  skillIds: string[];
}

interface AgentState {
  agents: AgentSummary[];
  teams: AgentTeam[];
  currentAgentId: string;
  currentTeamId: string | null;
  currentTargetType: AgentRunTargetType;
  loading: boolean;
}

const initialState: AgentState = {
  agents: [],
  teams: [],
  currentAgentId: 'main',
  currentTeamId: null,
  currentTargetType: AgentRunTargetType.Agent,
  loading: false,
};

const agentSlice = createSlice({
  name: 'agent',
  initialState,
  reducers: {
    setAgents(state, action: PayloadAction<AgentSummary[]>) {
      state.agents = action.payload;
    },

    setTeams(state, action: PayloadAction<AgentTeam[]>) {
      state.teams = action.payload;
    },

    setCurrentAgentId(state, action: PayloadAction<string>) {
      state.currentAgentId = action.payload;
      state.currentTeamId = null;
      state.currentTargetType = AgentRunTargetType.Agent;
    },

    setCurrentTeamId(state, action: PayloadAction<string | null>) {
      state.currentTeamId = action.payload;
      if (action.payload) {
        state.currentTargetType = AgentRunTargetType.Team;
      }
    },

    setCurrentTargetType(state, action: PayloadAction<AgentRunTargetType>) {
      state.currentTargetType = action.payload;
      if (action.payload === AgentRunTargetType.Agent) {
        state.currentTeamId = null;
      }
    },

    setLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },

    addAgent(state, action: PayloadAction<AgentSummary>) {
      state.agents.push(action.payload);
    },

    addTeam(state, action: PayloadAction<AgentTeam>) {
      state.teams.push(action.payload);
    },

    updateAgent(state, action: PayloadAction<{ id: string; updates: Partial<AgentSummary> }>) {
      const index = state.agents.findIndex((a) => a.id === action.payload.id);
      if (index !== -1) {
        state.agents[index] = { ...state.agents[index], ...action.payload.updates };
      }
    },

    removeAgent(state, action: PayloadAction<string>) {
      state.agents = state.agents.filter((a) => a.id !== action.payload);
      if (state.currentAgentId === action.payload) {
        state.currentAgentId = 'main';
      }
    },

    updateTeam(state, action: PayloadAction<{ id: string; updates: Partial<AgentTeam> }>) {
      const index = state.teams.findIndex((team) => team.id === action.payload.id);
      if (index !== -1) {
        state.teams[index] = { ...state.teams[index], ...action.payload.updates };
      }
    },

    removeTeam(state, action: PayloadAction<string>) {
      state.teams = state.teams.filter((team) => team.id !== action.payload);
      if (state.currentTeamId === action.payload) {
        state.currentTeamId = null;
        state.currentTargetType = AgentRunTargetType.Agent;
      }
    },
  },
});

export const {
  setAgents,
  setTeams,
  setCurrentAgentId,
  setCurrentTeamId,
  setCurrentTargetType,
  setLoading,
  addAgent,
  addTeam,
  updateAgent,
  removeAgent,
  updateTeam,
  removeTeam,
} = agentSlice.actions;

export default agentSlice.reducer;
