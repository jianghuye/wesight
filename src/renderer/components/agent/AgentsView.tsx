import { PlusIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import type { CoworkAgentEngine } from '@shared/cowork/constants';
import React, { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';

import { agentService } from '../../services/agent';
import { coworkService } from '../../services/cowork';
import { i18nService } from '../../services/i18n';
import { RootState } from '../../store';
import type { AgentTeam, AgentTeamMember, PresetAgent } from '../../types/agent';
import Modal from '../common/Modal';
import ComposeIcon from '../icons/ComposeIcon';
import SidebarToggleIcon from '../icons/SidebarToggleIcon';
import WindowTitleBar from '../window/WindowTitleBar';
import AgentCreateModal from './AgentCreateModal';
import { getAgentEngineLabel } from './AgentEngineSelect';
import AgentSettingsPanel from './AgentSettingsPanel';

interface AgentsViewProps {
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onNewChat?: () => void;
  onShowCowork?: () => void;
  updateBadge?: React.ReactNode;
  embedded?: boolean;
}

const NEW_TEAM_SETTINGS_ID = '__new__';

const showToast = (message: string): void => {
  window.dispatchEvent(new CustomEvent('app:showToast', { detail: message }));
};

type AgentOption = {
  id: string;
  name: string;
  icon: string;
  agentEngine: CoworkAgentEngine;
  enabled: boolean;
};

const AgentsView: React.FC<AgentsViewProps> = ({
  isSidebarCollapsed,
  onToggleSidebar,
  onNewChat,
  onShowCowork,
  updateBadge,
  embedded = false,
}) => {
  const isMac = window.electron.platform === 'darwin';
  const agents = useSelector((state: RootState) => state.agent.agents);
  const teams = useSelector((state: RootState) => state.agent.teams);
  const currentAgentId = useSelector((state: RootState) => state.agent.currentAgentId);
  const currentTeamId = useSelector((state: RootState) => state.agent.currentTeamId);
  const [presets, setPresets] = useState<PresetAgent[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [settingsAgentId, setSettingsAgentId] = useState<string | null>(null);
  const [settingsTeamId, setSettingsTeamId] = useState<string | null>(null);
  const [addingPreset, setAddingPreset] = useState<string | null>(null);
  const [installingTeamTemplate, setInstallingTeamTemplate] = useState(false);

  useEffect(() => {
    agentService.loadAgents();
    agentService.getPresets().then(setPresets);
  }, []);

  // Refresh presets when agents change (to update installed status)
  useEffect(() => {
    agentService.getPresets().then(setPresets);
  }, [agents]);

  const enabledAgents = agents.filter((a) => a.enabled && a.id !== 'main');
  const enabledTeams = teams.filter((team) => team.enabled);
  const presetAgents = enabledAgents.filter((a) => a.source === 'preset');
  const customAgents = enabledAgents.filter((a) => a.source === 'custom');
  const uninstalledPresets = presets.filter((p) => !p.installed);

  const handleAddPreset = async (presetId: string) => {
    setAddingPreset(presetId);
    try {
      await agentService.addPreset(presetId);
    } finally {
      setAddingPreset(null);
    }
  };

  const handleSwitchAgent = (agentId: string) => {
    agentService.switchAgent(agentId);
    coworkService.loadSessions(agentId);
    onShowCowork?.();
  };

  const handleSwitchTeam = (teamId: string) => {
    agentService.switchTeam(teamId);
    coworkService.loadSessions(`team:${teamId}`);
    onShowCowork?.();
  };

  const handleInstallDevelopmentTeam = async () => {
    setInstallingTeamTemplate(true);
    showToast(i18nService.t('agentTeamInstallStarting'));
    try {
      const team = await agentService.installDevelopmentTeamTemplate();
      if (team) {
        showToast(i18nService.t('agentTeamInstallSuccess'));
        handleSwitchTeam(team.id);
      } else {
        showToast(i18nService.t('agentTeamInstallFailed'));
      }
    } finally {
      setInstallingTeamTemplate(false);
    }
  };

  const getAgentName = (agentId: string): string => (
    agents.find((agent) => agent.id === agentId)?.name || agentId
  );

  return (
    <div className="flex-1 flex flex-col bg-background h-full">
      {!embedded && (
        <div className="draggable flex h-12 items-center justify-between px-4 border-b border-border shrink-0">
          <div className="flex items-center space-x-3 h-8">
            {isSidebarCollapsed && (
              <div className={`non-draggable flex items-center gap-1 ${isMac ? 'pl-[68px]' : ''}`}>
                <button
                  type="button"
                  onClick={onToggleSidebar}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-secondary hover:bg-surface-raised transition-colors"
                >
                  <SidebarToggleIcon className="h-4 w-4" isCollapsed={true} />
                </button>
                <button
                  type="button"
                  onClick={onNewChat}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-secondary hover:bg-surface-raised transition-colors"
                >
                  <ComposeIcon className="h-4 w-4" />
                </button>
                {updateBadge}
              </div>
            )}
            <h1 className="text-lg font-semibold text-foreground">
              {i18nService.t('myAgents')}
            </h1>
          </div>
          <WindowTitleBar inline />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 [scrollbar-gutter:stable]">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {/* Subtitle */}
          <p className="text-sm text-secondary mb-6">
            {i18nService.t('agentsSubtitle')}
          </p>

          {/* Agent Teams Section */}
          <div className="mb-8">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium text-secondary">
                  {i18nService.t('agentTeams')}
                </h2>
                <p className="mt-1 text-xs text-muted">
                  {i18nService.t('agentTeamsHint')}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSettingsTeamId(NEW_TEAM_SETTINGS_ID)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:border-primary/50 hover:text-primary"
                >
                  <PlusIcon className="h-4 w-4" />
                  {i18nService.t('createAgentTeam')}
                </button>
                <button
                  type="button"
                  onClick={handleInstallDevelopmentTeam}
                  disabled={installingTeamTemplate}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-50"
                >
                  <UserGroupIcon className="h-4 w-4" />
                  {installingTeamTemplate ? i18nService.t('installing') : i18nService.t('installDevelopmentTeam')}
                </button>
              </div>
            </div>
            {enabledTeams.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {enabledTeams.map((team) => (
                  <AgentTeamCard
                    key={team.id}
                    team={team}
                    isActive={team.id === currentTeamId}
                    memberLabels={team.members
                      .slice()
                      .sort((left, right) => left.order - right.order)
                      .map((member) => `${member.role || getAgentName(member.agentId)} · ${getAgentName(member.agentId)}`)}
                    onClick={() => handleSwitchTeam(team.id)}
                    onEdit={() => setSettingsTeamId(team.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-surface/60 px-4 py-5 text-sm text-secondary">
                {i18nService.t('agentTeamsEmpty')}
              </div>
            )}
          </div>

          {/* Preset Agents Section */}
          {(presetAgents.length > 0 || uninstalledPresets.length > 0) && (
            <div className="mb-8">
              <h2 className="text-sm font-medium text-secondary mb-3">
                {i18nService.t('presetAgents')}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {/* Installed presets */}
                {presetAgents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    icon={agent.icon}
                    name={agent.name}
                    description={agent.description}
                    badge={getAgentEngineLabel(agent.agentEngine)}
                    isActive={agent.id === currentAgentId}
                    onClick={() => setSettingsAgentId(agent.id)}
                  />
                ))}
                {/* Uninstalled presets */}
                {uninstalledPresets.map((preset) => {
                  const isEn = i18nService.getLanguage() === 'en';
                  return (
                    <UninstalledPresetCard
                      key={preset.id}
                      icon={preset.icon}
                      name={isEn && preset.nameEn ? preset.nameEn : preset.name}
                      description={isEn && preset.descriptionEn ? preset.descriptionEn : preset.description}
                      isAdding={addingPreset === preset.id}
                      onAdd={() => handleAddPreset(preset.id)}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Custom Agents Section */}
          <div>
            <h2 className="text-sm font-medium text-secondary mb-3">
              {i18nService.t('myCustomAgents')}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {customAgents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  icon={agent.icon}
                  name={agent.name}
                  description={agent.description}
                  badge={getAgentEngineLabel(agent.agentEngine)}
                  isActive={agent.id === currentAgentId}
                  onClick={() => setSettingsAgentId(agent.id)}
                />
              ))}
              {/* Create new agent card */}
              <button
                type="button"
                onClick={() => setIsCreateOpen(true)}
                className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-colors min-h-[140px] cursor-pointer"
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center bg-primary/10">
                  <PlusIcon className="h-5 w-5 text-primary" />
                </div>
                <span className="text-sm font-medium text-primary">
                  {i18nService.t('createNewAgent')}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <AgentCreateModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
      <AgentTeamSettingsPanel
        teamId={settingsTeamId}
        teams={teams}
        agents={enabledAgents}
        onClose={() => setSettingsTeamId(null)}
        onUseTeam={(id) => {
          setSettingsTeamId(null);
          handleSwitchTeam(id);
        }}
      />
      <AgentSettingsPanel
        agentId={settingsAgentId}
        onClose={() => setSettingsAgentId(null)}
        onSwitchAgent={(id) => {
          setSettingsAgentId(null);
          handleSwitchAgent(id);
        }}
      />
    </div>
  );
};

/* ── Agent Card (installed) ─────────────────────────── */

const AgentCard: React.FC<{
  icon: string;
  name: string;
  description: string;
  badge?: string;
  isActive: boolean;
  onClick: () => void;
}> = ({ icon, name, description, badge, isActive, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex flex-col items-start gap-2 p-4 rounded-xl border-2 text-left transition-all min-h-[140px] hover:shadow-md hover:bg-surface-raised ${
      isActive
        ? 'border-primary bg-primary/5'
        : 'border-border'
    }`}
  >
    <span className="text-3xl">{icon || '🤖'}</span>
    <div className="min-w-0 w-full">
      <div className="text-sm font-semibold text-foreground truncate">
        {name}
      </div>
      {description && (
        <div className="text-xs text-secondary mt-0.5 line-clamp-2">
          {description}
        </div>
      )}
      {badge && (
        <div className="mt-2 inline-flex max-w-full items-center rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-muted">
          <span className="truncate">{badge}</span>
        </div>
      )}
    </div>
  </button>
);

const AgentTeamCard: React.FC<{
  team: AgentTeam;
  isActive: boolean;
  memberLabels: string[];
  onClick: () => void;
  onEdit: () => void;
}> = ({ team, isActive, memberLabels, onClick, onEdit }) => (
  <div
    role="button"
    tabIndex={0}
    onClick={onClick}
    onKeyDown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onClick();
      }
    }}
    className={`flex min-h-[150px] flex-col items-start gap-3 rounded-xl border-2 p-4 text-left transition-all hover:bg-surface-raised hover:shadow-md ${
      isActive
        ? 'border-primary bg-primary/5'
        : 'border-border'
    }`}
  >
    <div className="flex w-full items-start gap-3">
      <span className="text-3xl">{team.icon || '👥'}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-foreground">
          {team.name}
        </div>
        {team.description && (
          <div className="mt-0.5 line-clamp-2 text-xs text-secondary">
            {team.description}
          </div>
        )}
      </div>
    </div>
    <div className="flex flex-wrap gap-1.5">
      {memberLabels.slice(0, 4).map((label) => (
        <span
          key={label}
          className="max-w-full rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-muted"
        >
          <span className="line-clamp-1">{label}</span>
        </span>
      ))}
    </div>
    <div className="mt-auto flex w-full items-center justify-between gap-2">
      <span className="text-xs font-medium text-primary">
        {i18nService.t('useAgentTeam')}
      </span>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onEdit();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            onEdit();
          }
        }}
        className="rounded-lg px-2 py-1 text-xs font-medium text-secondary hover:bg-surface hover:text-foreground"
      >
        {i18nService.t('editAgentTeam')}
      </button>
    </div>
  </div>
);

const AgentTeamSettingsPanel: React.FC<{
  teamId: string | null;
  teams: AgentTeam[];
  agents: AgentOption[];
  onClose: () => void;
  onUseTeam: (teamId: string) => void;
}> = ({ teamId, teams, agents, onClose, onUseTeam }) => {
  const isOpen = teamId !== null;
  const isCreate = teamId === NEW_TEAM_SETTINGS_ID;
  const team = !isCreate && teamId ? teams.find((item) => item.id === teamId) : null;
  const availableAgents = useMemo(
    () => agents.filter((agent) => agent.enabled && agent.id !== 'main'),
    [agents],
  );
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('👥');
  const [leadAgentId, setLeadAgentId] = useState('');
  const [members, setMembers] = useState<AgentTeamMember[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (team) {
      const sortedMembers = team.members.slice().sort((left, right) => left.order - right.order);
      setName(team.name);
      setDescription(team.description);
      setIcon(team.icon || '👥');
      setLeadAgentId(team.leadAgentId || sortedMembers[0]?.agentId || '');
      setMembers(sortedMembers);
      return;
    }
    const firstAgent = availableAgents[0];
    setName('');
    setDescription('');
    setIcon('👥');
    setLeadAgentId(firstAgent?.id || '');
    setMembers(firstAgent ? [{ agentId: firstAgent.id, role: firstAgent.name, order: 0 }] : []);
  }, [availableAgents, isOpen, team]);

  if (!isOpen) {
    return null;
  }

  const normalizeMembers = (): AgentTeamMember[] => members
    .filter((member) => member.agentId)
    .map((member, index) => ({
      ...member,
      role: member.role.trim() || getAgentNameForList(availableAgents, member.agentId),
      order: index,
    }));

  const handleAddMember = () => {
    const nextAgent = availableAgents.find((agent) => !members.some((member) => member.agentId === agent.id));
    if (!nextAgent) return;
    const nextMembers = [
      ...members,
      { agentId: nextAgent.id, role: nextAgent.name, order: members.length },
    ];
    setMembers(nextMembers);
    if (!leadAgentId) {
      setLeadAgentId(nextAgent.id);
    }
  };

  const handleMemberAgentChange = (index: number, agentId: string) => {
    setMembers((current) => current.map((member, memberIndex) => (
      memberIndex === index
        ? { ...member, agentId, role: member.role || getAgentNameForList(availableAgents, agentId) }
        : member
    )));
    if (!leadAgentId) {
      setLeadAgentId(agentId);
    }
  };

  const handleMoveMember = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= members.length) return;
    const nextMembers = members.slice();
    const [member] = nextMembers.splice(index, 1);
    nextMembers.splice(nextIndex, 0, member);
    setMembers(nextMembers.map((item, itemIndex) => ({ ...item, order: itemIndex })));
  };

  const handleRemoveMember = (index: number) => {
    const nextMembers = members.filter((_, memberIndex) => memberIndex !== index)
      .map((item, itemIndex) => ({ ...item, order: itemIndex }));
    setMembers(nextMembers);
    if (leadAgentId === members[index]?.agentId) {
      setLeadAgentId(nextMembers[0]?.agentId || '');
    }
  };

  const handleSave = async () => {
    const normalizedMembers = normalizeMembers();
    if (!name.trim() || normalizedMembers.length === 0) return;
    setSaving(true);
    try {
      const finalLeadAgentId = normalizedMembers.some((member) => member.agentId === leadAgentId)
        ? leadAgentId
        : normalizedMembers[0].agentId;
      const payload = {
        name: name.trim(),
        description: description.trim(),
        icon: icon.trim() || '👥',
        leadAgentId: finalLeadAgentId,
        members: normalizedMembers,
        skillIds: [],
      };
      if (isCreate) {
        await agentService.createTeam(payload);
      } else if (team) {
        await agentService.updateTeam(team.id, payload);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!team) return;
    setSaving(true);
    try {
      await agentService.deleteTeam(team.id);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const canAddMember = availableAgents.some((agent) => !members.some((member) => member.agentId === agent.id));
  const canSave = name.trim().length > 0 && normalizeMembers().length > 0 && !saving;

  return (
    <Modal
      isOpen
      onClose={onClose}
      className="w-[min(720px,calc(100vw-32px))] max-h-[calc(100vh-80px)] overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            {isCreate ? i18nService.t('createAgentTeam') : i18nService.t('editAgentTeam')}
          </h2>
          <p className="mt-1 text-xs text-secondary">
            {i18nService.t('agentTeamsHint')}
          </p>
        </div>
        {!isCreate && team && (
          <button
            type="button"
            onClick={() => onUseTeam(team.id)}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover"
          >
            {i18nService.t('useAgentTeam')}
          </button>
        )}
      </div>
      <div className="max-h-[calc(100vh-220px)] space-y-5 overflow-y-auto px-5 py-5">
        <div className="grid gap-4 sm:grid-cols-[88px,1fr]">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-secondary">{i18nService.t('teamIcon')}</span>
            <input
              value={icon}
              onChange={(event) => setIcon(event.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-transparent px-3 text-center text-lg text-foreground"
              maxLength={4}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-secondary">{i18nService.t('teamName')}</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={i18nService.t('teamNamePlaceholder')}
              className="h-10 w-full rounded-lg border border-border bg-transparent px-3 text-sm text-foreground"
            />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-secondary">{i18nService.t('teamDescription')}</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={i18nService.t('teamDescriptionPlaceholder')}
            className="min-h-[76px] w-full resize-none rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground"
          />
        </label>
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-secondary">{i18nService.t('teamMembers')}</div>
              <div className="text-xs text-muted">{i18nService.t('teamMembersHint')}</div>
            </div>
            <button
              type="button"
              onClick={handleAddMember}
              disabled={!canAddMember}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-secondary hover:border-primary/50 hover:text-primary disabled:opacity-50"
            >
              {i18nService.t('addTeamMember')}
            </button>
          </div>
          {members.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-secondary">
              {i18nService.t('noTeamMembers')}
            </div>
          ) : (
            <div className="space-y-2">
              {members.map((member, index) => (
                <div key={`${member.agentId}-${index}`} className="grid gap-2 rounded-xl border border-border bg-surface/60 p-3 sm:grid-cols-[1fr,1fr,auto]">
                  <select
                    value={member.agentId}
                    onChange={(event) => handleMemberAgentChange(index, event.target.value)}
                    className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {availableAgents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.icon ? `${agent.icon} ` : ''}{agent.name} · {getAgentEngineLabel(agent.agentEngine)}
                      </option>
                    ))}
                  </select>
                  <input
                    value={member.role}
                    onChange={(event) => setMembers((current) => current.map((item, itemIndex) => (
                      itemIndex === index ? { ...item, role: event.target.value } : item
                    )))}
                    placeholder={i18nService.t('teamRolePlaceholder')}
                    className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
                  />
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleMoveMember(index, -1)}
                      disabled={index === 0}
                      className="rounded-lg px-2 py-1 text-xs text-secondary hover:bg-surface disabled:opacity-40"
                    >
                      {i18nService.t('moveUp')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveMember(index, 1)}
                      disabled={index === members.length - 1}
                      className="rounded-lg px-2 py-1 text-xs text-secondary hover:bg-surface disabled:opacity-40"
                    >
                      {i18nService.t('moveDown')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(index)}
                      className="rounded-lg px-2 py-1 text-xs text-red-500 hover:bg-red-500/10"
                    >
                      {i18nService.t('delete')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-secondary">{i18nService.t('teamLead')}</span>
          <select
            value={leadAgentId}
            onChange={(event) => setLeadAgentId(event.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-transparent px-3 text-sm text-foreground"
          >
            {normalizeMembers().map((member) => (
              <option key={member.agentId} value={member.agentId}>
                {getAgentNameForList(availableAgents, member.agentId)} · {member.role}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center justify-between border-t border-border px-5 py-4">
        {!isCreate && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className="rounded-lg px-3 py-2 text-sm font-medium text-red-500 hover:bg-red-500/10 disabled:opacity-50"
          >
            {i18nService.t('delete')}
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-secondary hover:text-foreground disabled:opacity-50"
          >
            {i18nService.t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
          >
            {saving ? i18nService.t('saving') : i18nService.t('save')}
          </button>
        </div>
      </div>
    </Modal>
  );
};

const getAgentNameForList = (agents: AgentOption[], agentId: string): string => (
  agents.find((agent) => agent.id === agentId)?.name || agentId
);

/* ── Uninstalled Preset Card ─────────────────────────── */

const UninstalledPresetCard: React.FC<{
  icon: string;
  name: string;
  description: string;
  isAdding: boolean;
  onAdd: () => void;
}> = ({ icon, name, description, isAdding, onAdd }) => (
  <div className="flex flex-col items-start gap-2 p-4 rounded-xl border-2 border-dashed border-border opacity-60 hover:opacity-80 transition-opacity min-h-[140px]">
    <span className="text-3xl">{icon || '🤖'}</span>
    <div className="min-w-0 w-full flex-1">
      <div className="text-sm font-semibold text-foreground truncate">
        {name}
      </div>
      {description && (
        <div className="text-xs text-secondary mt-0.5 line-clamp-2">
          {description}
        </div>
      )}
    </div>
    <button
      type="button"
      onClick={onAdd}
      disabled={isAdding}
      className="self-end px-3 py-1 text-xs font-medium rounded-lg bg-primary text-white hover:bg-primary-hover disabled:opacity-50 transition-colors"
    >
      {isAdding ? '...' : i18nService.t('addAgent')}
    </button>
  </div>
);

export default AgentsView;
