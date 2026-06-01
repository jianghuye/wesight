import { type CoworkAgentEngine, CoworkSessionKind,RuntimeCallSource } from '../shared/cowork/constants';
import type { CoworkSessionRuntimeSnapshot } from '../shared/cowork/runtimeSnapshot';
import type { AgentManager } from './agentManager';
import type { Agent, AgentTeam, CoworkMessage, CoworkStore } from './coworkStore';
import type { CoworkRuntime } from './libs/agentEngine/types';

type RuntimeReadyResult = {
  success: boolean;
  error?: string;
};

type AgentTeamRunnerOptions = {
  coworkStore: CoworkStore;
  agentManager: AgentManager;
  runtime: CoworkRuntime;
  resolveFallbackEngine: () => CoworkAgentEngine;
  ensureEngineReady: (engine: CoworkAgentEngine) => Promise<RuntimeReadyResult>;
  applyEngineConfigSource: (engine: CoworkAgentEngine) => void;
  resolveRuntimeSnapshot: (engine: CoworkAgentEngine) => CoworkSessionRuntimeSnapshot;
  prepareRuntimeSnapshot: (snapshot: CoworkSessionRuntimeSnapshot) => void;
  mergeSystemPrompt: (engine: CoworkAgentEngine, systemPrompt?: string) => string;
  broadcastMessage: (sessionId: string, message: CoworkMessage) => void;
  broadcastComplete: (sessionId: string) => void;
  broadcastError: (sessionId: string, error: string) => void;
  startFileActivity: (sessionId: string, cwd: string) => void;
};

type TeamRunInput = {
  teamId: string;
  parentSessionId: string;
  prompt: string;
  runtimeSource?: RuntimeCallSource;
};

type MemberResult = {
  agent: Agent;
  role: string;
  engine: CoworkAgentEngine;
  output: string;
  durationMs: number;
  childSessionId: string;
};

export class AgentTeamRunner {
  private readonly options: AgentTeamRunnerOptions;

  constructor(options: AgentTeamRunnerOptions) {
    this.options = options;
  }

  async run(input: TeamRunInput): Promise<void> {
    const parentSession = this.options.coworkStore.getSession(input.parentSessionId);
    if (!parentSession) {
      throw new Error(`Team parent session not found: ${input.parentSessionId}`);
    }

    const team = this.options.agentManager.getAgentTeam(input.teamId);
    if (!team) {
      throw new Error(`Agent team not found: ${input.teamId}`);
    }

    const members = this.resolveMembers(team);
    if (members.length === 0) {
      throw new Error(`Agent team has no enabled members: ${team.name}`);
    }

    this.options.coworkStore.updateSession(parentSession.id, { status: 'running' });

    const results: MemberResult[] = [];
    try {
      this.addTeamNotice(parentSession.id, team, {
        status: 'planning',
        content: `${team.name} started planning with ${members.length} member(s).`,
      });

      for (const member of members) {
        const startedAt = Date.now();
        const engine = member.agent.agentEngine || this.options.resolveFallbackEngine();
        this.options.applyEngineConfigSource(engine);
        const runtimeSnapshot = this.options.resolveRuntimeSnapshot(engine);
        this.options.prepareRuntimeSnapshot(runtimeSnapshot);
        const ready = await this.options.ensureEngineReady(engine);
        if (!ready.success) {
          throw new Error(ready.error || `${member.agent.name} engine is not ready`);
        }

        const childSession = this.options.coworkStore.createSession(
          `[${team.name}] ${member.agent.name}`,
          parentSession.cwd,
          this.buildMemberSystemPrompt(member.agent, member.role),
          parentSession.executionMode,
          this.mergeSkillIds(parentSession.activeSkillIds, team.skillIds, member.agent.skillIds),
          member.agent.id,
          {
            sessionKind: CoworkSessionKind.TeamChild,
            parentSessionId: parentSession.id,
            teamId: team.id,
            runtimeSnapshot,
          },
        );
        this.options.coworkStore.updateSession(childSession.id, { status: 'running' });
        this.options.startFileActivity(childSession.id, childSession.cwd);

        const memberPrompt = this.buildMemberPrompt({
          team,
          agent: member.agent,
          role: member.role,
          userPrompt: input.prompt,
          previousResults: results,
        });

        const startedMessage = this.addTeamTurn(parentSession.id, {
          team,
          agent: member.agent,
          role: member.role,
          engine,
          childSessionId: childSession.id,
          status: 'running',
          startedAt,
          input: memberPrompt,
          output: '',
        });
        this.options.broadcastMessage(parentSession.id, startedMessage);

        await this.options.runtime.startSession(childSession.id, memberPrompt, {
          systemPrompt: this.options.mergeSystemPrompt(engine, childSession.systemPrompt),
          skillIds: childSession.activeSkillIds,
          workspaceRoot: parentSession.cwd,
          confirmationMode: 'modal',
          agentId: member.agent.id,
          agentEngine: engine,
          runtimeSnapshot,
          runtimeSource: input.runtimeSource || RuntimeCallSource.Chat,
        });

        const completedChild = this.options.coworkStore.getSession(childSession.id);
        const output = this.extractLatestAssistantOutput(completedChild);
        const durationMs = Date.now() - startedAt;
        results.push({
          agent: member.agent,
          role: member.role,
          engine,
          output,
          durationMs,
          childSessionId: childSession.id,
        });

        const completedMessage = this.addTeamTurn(parentSession.id, {
          team,
          agent: member.agent,
          role: member.role,
          engine,
          childSessionId: childSession.id,
          status: 'completed',
          startedAt,
          completedAt: Date.now(),
          durationMs,
          input: memberPrompt,
          output,
        });
        this.options.broadcastMessage(parentSession.id, completedMessage);
      }

      const finalMessage = this.options.coworkStore.addMessage(parentSession.id, {
        type: 'assistant',
        content: this.buildFinalOutput(team, results),
        metadata: {
          kind: 'team_final',
          teamId: team.id,
          teamName: team.name,
          memberCount: results.length,
        },
      });
      this.options.broadcastMessage(parentSession.id, finalMessage);
      this.options.coworkStore.updateSession(parentSession.id, { status: 'completed' });
      this.options.broadcastComplete(parentSession.id);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const failedMessage = this.options.coworkStore.addMessage(parentSession.id, {
        type: 'system',
        content: errorMessage,
        metadata: {
          kind: 'team_error',
          teamId: team.id,
          teamName: team.name,
          error: errorMessage,
        },
      });
      this.options.broadcastMessage(parentSession.id, failedMessage);
      this.options.coworkStore.updateSession(parentSession.id, { status: 'error' });
      this.options.broadcastError(parentSession.id, errorMessage);
    }
  }

  private resolveMembers(team: AgentTeam): Array<{ agent: Agent; role: string }> {
    return team.members
      .slice()
      .sort((left, right) => left.order - right.order)
      .map((member) => {
        const agent = this.options.agentManager.getAgent(member.agentId);
        if (!agent || !agent.enabled) return null;
        return {
          agent,
          role: member.role || agent.name,
        };
      })
      .filter((member): member is { agent: Agent; role: string } => Boolean(member));
  }

  private buildMemberSystemPrompt(agent: Agent, role: string): string {
    return [
      agent.systemPrompt,
      agent.identity,
      `You are working as ${role} in an Agent Team. Focus on your role, produce concise handoff notes, and keep the shared project directory consistent.`,
    ].filter(Boolean).join('\n\n');
  }

  private buildMemberPrompt(input: {
    team: AgentTeam;
    agent: Agent;
    role: string;
    userPrompt: string;
    previousResults: MemberResult[];
  }): string {
    const previous = input.previousResults.length
      ? input.previousResults.map((result, index) => [
        `Step ${index + 1}: ${result.agent.name} (${result.role})`,
        result.output || '(no visible output)',
      ].join('\n')).join('\n\n')
      : 'No previous member output yet.';

    return [
      `Team: ${input.team.name}`,
      `Current member: ${input.agent.name}`,
      `Role: ${input.role}`,
      '',
      'User task:',
      input.userPrompt,
      '',
      'Previous member output:',
      previous,
      '',
      'Please complete only your part of the team workflow. End with a short handoff summary for the next member.',
    ].join('\n');
  }

  private buildFinalOutput(team: AgentTeam, results: MemberResult[]): string {
    if (results.length === 0) {
      return `${team.name} did not produce a visible result.`;
    }
    const last = results[results.length - 1];
    const summary = results.map((result, index) => (
      `${index + 1}. ${result.agent.name} (${result.role}) · ${result.engine} · ${Math.round(result.durationMs / 1000)}s`
    )).join('\n');
    return [
      `Agent Team ${team.name} completed the task.`,
      '',
      'Member timeline:',
      summary,
      '',
      'Final result:',
      last.output || 'The team completed the workflow, but the last member did not produce visible text.',
    ].join('\n');
  }

  private addTeamNotice(
    parentSessionId: string,
    team: AgentTeam,
    input: {
      status: string;
      content: string;
    },
  ): CoworkMessage {
    const message = this.options.coworkStore.addMessage(parentSessionId, {
      type: 'assistant',
      content: input.content,
      metadata: {
        kind: 'team_notice',
        teamId: team.id,
        teamName: team.name,
        status: input.status,
      },
    });
    this.options.broadcastMessage(parentSessionId, message);
    return message;
  }

  private addTeamTurn(
    parentSessionId: string,
    input: {
      team: AgentTeam;
      agent: Agent;
      role: string;
      engine: CoworkAgentEngine;
      childSessionId: string;
      status: 'running' | 'completed';
      startedAt: number;
      completedAt?: number;
      durationMs?: number;
      input: string;
      output: string;
    },
  ): CoworkMessage {
    return this.options.coworkStore.addMessage(parentSessionId, {
      type: 'assistant',
      content: input.status === 'running'
        ? `${input.agent.name} started ${input.role}.`
        : `${input.agent.name} completed ${input.role}.`,
      metadata: {
        kind: 'team_turn',
        teamId: input.team.id,
        teamName: input.team.name,
        memberAgentId: input.agent.id,
        memberName: input.agent.name,
        memberRole: input.role,
        agentEngine: input.engine,
        childSessionId: input.childSessionId,
        status: input.status,
        startedAt: input.startedAt,
        completedAt: input.completedAt,
        durationMs: input.durationMs,
        input: input.input,
        output: input.output,
      },
    });
  }

  private extractLatestAssistantOutput(session: ReturnType<CoworkStore['getSession']>): string {
    if (!session) return '';
    for (let index = session.messages.length - 1; index >= 0; index -= 1) {
      const message = session.messages[index];
      if (message.type === 'assistant' && message.content.trim()) {
        return message.content.trim();
      }
    }
    return '';
  }

  private mergeSkillIds(...groups: Array<string[] | undefined>): string[] {
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const group of groups) {
      for (const item of group || []) {
        if (!item || seen.has(item)) continue;
        seen.add(item);
        merged.push(item);
      }
    }
    return merged;
  }
}
