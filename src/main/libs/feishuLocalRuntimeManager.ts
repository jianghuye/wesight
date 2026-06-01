import { spawnSync, type SpawnSyncReturns } from 'child_process';
import crypto from 'crypto';
import { app } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  FeishuEngineKey,
  type FeishuEngineKeyType,
  FeishuRuntimeOwnership,
  type FeishuRuntimeOwnershipType,
} from '../../shared/im/constants';
import type { FeishuInstanceConfig, FeishuRuntimeOwnershipStatus } from '../im/types';
import {
  buildHermesFeishuEnvForInstances,
  buildHermesRuntimeEnvForLocalCli,
  HERMES_WESIGHT_FEISHU_ENV_BLOCK,
  mergeHermesManagedDotenvBlock,
  parseHermesConfigText,
  parseHermesDotenvText,
} from './hermesConfig';
import type { HermesEngineManager } from './hermesEngineManager';
import type { OpenClawEngineManager } from './openclawEngineManager';
import {
  atomicWriteJson,
  buildOpenClawCommandPath,
  OPENCLAW_DEFAULT_GATEWAY_PORT,
  readOpenClawGlobalConfig,
  resolveOpenClawSystemRuntime,
} from './openclawSystemRuntime';

const LocalRuntimeLabel = {
  OpenClaw: 'ai.wesight.openclaw.feishu',
  Hermes: 'ai.wesight.hermes.feishu',
} as const;

const LocalRuntimeFileName = {
  OpenClaw: 'openclaw-feishu',
  Hermes: 'hermes-feishu',
} as const;

interface TransferDeps {
  openClawEngineManager: OpenClawEngineManager;
  hermesEngineManager: HermesEngineManager;
}

interface LaunchAgentPaths {
  label: string;
  plistPath: string;
  scriptPath: string;
  envPath: string;
  stdoutPath: string;
  stderrPath: string;
}

export interface FeishuRuntimeOwnershipTransferResult {
  success: boolean;
  status?: FeishuRuntimeOwnershipStatus;
  error?: string;
}

const isSupportedEngine = (engineKey: FeishuEngineKeyType): boolean => (
  engineKey === FeishuEngineKey.OpenClaw || engineKey === FeishuEngineKey.Hermes
);

const localRuntimeBaseDir = (): string => (
  path.join(app.getPath('userData'), 'local-runtimes')
);

const ensureDir = (dirPath: string): void => {
  fs.mkdirSync(dirPath, { recursive: true });
};

const atomicWriteText = (filePath: string, content: string, mode?: number): void => {
  ensureDir(path.dirname(filePath));
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, content, { encoding: 'utf8', mode });
  fs.renameSync(tmpPath, filePath);
  if (mode !== undefined) {
    fs.chmodSync(filePath, mode);
  }
};

const shellQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;

const shellEnvLine = (key: string, value: string): string => (
  `export ${key}=${shellQuote(value)}`
);

const xmlEscape = (value: string): string => (
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
);

const launchAgentDomain = (): string => `gui/${typeof process.getuid === 'function' ? process.getuid() : os.userInfo().uid}`;

const runLaunchctl = (args: string[]): SpawnSyncReturns<string> => (
  spawnSync('/bin/launchctl', args, {
    encoding: 'utf8',
    timeout: 15_000,
  })
);

const sleepSync = (ms: number): void => {
  spawnSync('/bin/sleep', [(ms / 1_000).toFixed(2)], { timeout: ms + 1_000 });
};

const readTextTail = (filePath: string, maxChars = 2_000): string => {
  try {
    return fs.readFileSync(filePath, 'utf8').slice(-maxChars).trim();
  } catch {
    return '';
  }
};

const describeFile = (filePath: string): string => {
  try {
    const stat = fs.statSync(filePath);
    return `${filePath} mode=${(stat.mode & 0o777).toString(8)} size=${stat.size}`;
  } catch {
    return `${filePath} missing`;
  }
};

const isLaunchAgentLoaded = (label: string): boolean => (
  process.platform === 'darwin'
  && runLaunchctl(['print', `${launchAgentDomain()}/${label}`]).status === 0
);

const buildPaths = (engineKey: FeishuEngineKeyType): LaunchAgentPaths => {
  const openClaw = engineKey === FeishuEngineKey.OpenClaw;
  const label = openClaw ? LocalRuntimeLabel.OpenClaw : LocalRuntimeLabel.Hermes;
  const fileName = openClaw ? LocalRuntimeFileName.OpenClaw : LocalRuntimeFileName.Hermes;
  const baseDir = localRuntimeBaseDir();
  const logDir = path.join(os.homedir(), 'Library', 'Logs', 'WeSight');
  return {
    label,
    plistPath: path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`),
    scriptPath: path.join(baseDir, `${fileName}-gateway.sh`),
    envPath: path.join(baseDir, `${fileName}.env`),
    stdoutPath: path.join(logDir, `${fileName}.out.log`),
    stderrPath: path.join(logDir, `${fileName}.err.log`),
  };
};

const writeLaunchAgent = (paths: LaunchAgentPaths): void => {
  if (process.platform !== 'darwin') {
    throw new Error('Local runtime ownership is only supported on macOS.');
  }
  ensureDir(path.dirname(paths.plistPath));
  ensureDir(path.dirname(paths.stdoutPath));
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(paths.label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(paths.scriptPath)}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xmlEscape(paths.stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(paths.stderrPath)}</string>
</dict>
</plist>
`;
  atomicWriteText(paths.plistPath, plist, 0o644);
};

const unloadLaunchAgent = (paths: LaunchAgentPaths): void => {
  if (process.platform !== 'darwin') return;
  const domain = launchAgentDomain();
  runLaunchctl(['bootout', `${domain}/${paths.label}`]);
  runLaunchctl(['bootout', domain, paths.plistPath]);
  runLaunchctl(['remove', paths.label]);
};

const waitForLaunchAgentUnloaded = (label: string, timeoutMs = 5_000): boolean => {
  if (process.platform !== 'darwin') return true;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isLaunchAgentLoaded(label)) return true;
    sleepSync(200);
  }
  return !isLaunchAgentLoaded(label);
};

const buildLaunchAgentFailureMessage = (
  paths: LaunchAgentPaths,
  result: SpawnSyncReturns<string>,
): string => {
  const lines = [
    (result.stderr || result.stdout || 'Failed to bootstrap LaunchAgent.').trim(),
    `plist: ${describeFile(paths.plistPath)}`,
    `script: ${describeFile(paths.scriptPath)}`,
    `stdout: ${describeFile(paths.stdoutPath)}`,
    `stderr: ${describeFile(paths.stderrPath)}`,
  ];
  const lint = spawnSync('/usr/bin/plutil', ['-lint', paths.plistPath], {
    encoding: 'utf8',
    timeout: 5_000,
  });
  if (lint.status !== 0 || lint.stdout || lint.stderr) {
    lines.push(`plutil: ${(lint.stderr || lint.stdout || '').trim()}`);
  }
  const stderrTail = readTextTail(paths.stderrPath);
  if (stderrTail) {
    lines.push(`stderr tail:\n${stderrTail}`);
  }
  return lines.filter(Boolean).join('\n');
};

const loadLaunchAgent = (paths: LaunchAgentPaths): void => {
  unloadLaunchAgent(paths);
  waitForLaunchAgentUnloaded(paths.label);
  const result = runLaunchctl(['bootstrap', launchAgentDomain(), paths.plistPath]);
  if (result.status !== 0) {
    if (isLaunchAgentLoaded(paths.label)) {
      runLaunchctl(['enable', `${launchAgentDomain()}/${paths.label}`]);
      runLaunchctl(['kickstart', '-k', `${launchAgentDomain()}/${paths.label}`]);
      return;
    }
    throw new Error(buildLaunchAgentFailureMessage(paths, result));
  }
  runLaunchctl(['enable', `${launchAgentDomain()}/${paths.label}`]);
  runLaunchctl(['kickstart', '-k', `${launchAgentDomain()}/${paths.label}`]);
};

const removeFileIfExists = (filePath: string): void => {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // Best-effort cleanup.
  }
};

const enabledFeishuInstances = (instances: FeishuInstanceConfig[]): FeishuInstanceConfig[] => (
  instances.filter((instance) => instance.enabled && instance.appId.trim() && instance.appSecret.trim())
);

const buildOpenClawFeishuChannelConfig = (instances: FeishuInstanceConfig[]): Record<string, unknown> => {
  const enabled = enabledFeishuInstances(instances);
  if (!enabled.length) {
    return {
      enabled: false,
      accounts: {},
    };
  }
  const accounts: Record<string, unknown> = {};
  enabled.forEach((instance, index) => {
    const secretEnvVar = index === 0 ? 'LOBSTER_FEISHU_APP_SECRET' : `LOBSTER_FEISHU_APP_SECRET_${index}`;
    accounts[instance.instanceId.slice(0, 8)] = {
      enabled: true,
      name: instance.instanceName,
      appId: instance.appId.trim(),
      appSecret: `\${${secretEnvVar}}`,
      domain: instance.domain === 'lark' ? 'lark' : 'feishu',
      dmPolicy: instance.dmPolicy || 'open',
      allowFrom: instance.dmPolicy === 'open'
        ? Array.from(new Set([...(instance.allowFrom || []), '*']))
        : (instance.allowFrom || []),
      groupPolicy: instance.groupPolicy || 'allowlist',
      groupAllowFrom: instance.groupPolicy === 'open'
        ? Array.from(new Set([...(instance.groupAllowFrom || []), '*']))
        : (instance.groupAllowFrom || []),
      groups: instance.groups && Object.keys(instance.groups).length > 0
        ? instance.groups
        : { '*': { requireMention: true } },
      historyLimit: instance.historyLimit || 50,
      replyMode: instance.replyMode || 'auto',
      mediaMaxMb: instance.mediaMaxMb || 30,
    };
  });
  return {
    enabled: true,
    accounts,
  };
};

const writeOpenClawLocalRuntime = (
  instances: FeishuInstanceConfig[],
  deps: TransferDeps,
  paths: LaunchAgentPaths,
): string => {
  const enabled = enabledFeishuInstances(instances);
  if (!enabled.length) {
    throw new Error('Enable at least one OpenClaw Feishu instance before switching to local runtime ownership.');
  }
  const runtime = resolveOpenClawSystemRuntime();
  if (!runtime.commandPath) {
    throw new Error('OpenClaw CLI was not found.');
  }
  const existing = readOpenClawGlobalConfig(runtime.configPath) ?? {};
  const gateway = existing.gateway && typeof existing.gateway === 'object' && !Array.isArray(existing.gateway)
    ? existing.gateway as Record<string, unknown>
    : {};
  const auth = gateway.auth && typeof gateway.auth === 'object' && !Array.isArray(gateway.auth)
    ? gateway.auth as Record<string, unknown>
    : {};
  const port = runtime.gatewayPort || OPENCLAW_DEFAULT_GATEWAY_PORT;
  const token = runtime.gatewayToken || crypto.randomBytes(24).toString('hex');
  const channels = existing.channels && typeof existing.channels === 'object' && !Array.isArray(existing.channels)
    ? existing.channels as Record<string, unknown>
    : {};

  atomicWriteJson(runtime.configPath, {
    ...existing,
    gateway: {
      ...gateway,
      mode: gateway.mode || 'local',
      port,
      bind: gateway.bind || 'loopback',
      auth: {
        ...auth,
        mode: auth.mode || 'token',
        token,
      },
    },
    channels: {
      ...channels,
      feishu: buildOpenClawFeishuChannelConfig(enabled),
    },
  });

  const secretLines = enabled.map((instance, index) => (
    shellEnvLine(index === 0 ? 'LOBSTER_FEISHU_APP_SECRET' : `LOBSTER_FEISHU_APP_SECRET_${index}`, instance.appSecret.trim())
  ));
  atomicWriteText(paths.envPath, `${secretLines.join('\n')}\n`, 0o600);

  const script = `#!/bin/zsh
set -e
source ${shellQuote(paths.envPath)}
export PATH=${shellQuote(buildOpenClawCommandPath())}
export OPENCLAW_CONFIG_PATH=${shellQuote(runtime.configPath)}
export OPENCLAW_GATEWAY_TOKEN=${shellQuote(token)}
export OPENCLAW_GATEWAY_PORT=${shellQuote(String(port))}
export OPENCLAW_NO_RESPAWN=1
exec ${shellQuote(runtime.commandPath)} gateway --port ${shellQuote(String(port))} --token ${shellQuote(token)} --bind loopback
`;
  atomicWriteText(paths.scriptPath, script, 0o700);
  deps.openClawEngineManager.setSecretEnvVars({});
  return runtime.configPath;
};

const readHermesEnvText = (filePath: string): string => {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
};

const writeHermesStateFiles = (manager: HermesEngineManager, port: number, token: string): void => {
  const stateDir = manager.getStateDir();
  ensureDir(stateDir);
  atomicWriteText(path.join(stateDir, 'gateway-token'), token, 0o600);
  atomicWriteText(path.join(stateDir, 'gateway-port.json'), `${JSON.stringify({ port }, null, 2)}\n`, 0o600);
};

const buildHermesSearchPath = (): string => [
  path.join(os.homedir(), '.local', 'bin'),
  '/opt/homebrew/bin',
  '/usr/local/bin',
  process.env.PATH ?? '',
].join(path.delimiter);

const resolveHermesCommand = (): string | null => {
  const result = spawnSync(process.env.SHELL || '/bin/zsh', ['-lc', 'command -v hermes'], {
    encoding: 'utf8',
    timeout: 10_000,
    env: {
      ...process.env,
      PATH: buildHermesSearchPath(),
    },
  });
  if (result.status !== 0) return null;
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? null;
};

const writeHermesLocalRuntime = (
  instances: FeishuInstanceConfig[],
  deps: TransferDeps,
  paths: LaunchAgentPaths,
): string => {
  const commandPath = resolveHermesCommand();
  if (!commandPath) {
    throw new Error('Hermes Agent CLI was not found.');
  }
  const feishuEnv = buildHermesFeishuEnvForInstances(instances);
  if (feishuEnv.error) {
    throw new Error(feishuEnv.error);
  }
  if (!Object.keys(feishuEnv.env).length) {
    throw new Error('Enable one Hermes Feishu instance before switching to local runtime ownership.');
  }

  const existingEnvText = readHermesEnvText(deps.hermesEngineManager.getEnvPath());
  const parsedEnv = parseHermesDotenvText(existingEnvText);
  const port = Number(parsedEnv.API_SERVER_PORT || parsedEnv.HERMES_GATEWAY_PORT || 18879);
  const safePort = Number.isInteger(port) && port > 0 && port < 65536 ? port : 18879;
  const token = parsedEnv.API_SERVER_KEY || parsedEnv.HERMES_GATEWAY_TOKEN || crypto.randomBytes(24).toString('hex');
  const nextEnvText = mergeHermesManagedDotenvBlock(
    existingEnvText,
    HERMES_WESIGHT_FEISHU_ENV_BLOCK,
    {
      ...feishuEnv.env,
      API_SERVER_ENABLED: 'true',
      API_SERVER_HOST: '127.0.0.1',
      API_SERVER_PORT: String(safePort),
      API_SERVER_KEY: token,
      HERMES_GATEWAY_TOKEN: token,
      HERMES_GATEWAY_PORT: String(safePort),
    },
  );
  atomicWriteText(deps.hermesEngineManager.getEnvPath(), nextEnvText, 0o600);
  writeHermesStateFiles(deps.hermesEngineManager, safePort, token);
  const runtimeEnv = buildHermesRuntimeEnvForLocalCli(
    parseHermesConfigText(readHermesEnvText(deps.hermesEngineManager.getConfigPath())),
    parseHermesDotenvText(nextEnvText),
  );
  const runtimeEnvKeys = [
    'HERMES_INFERENCE_PROVIDER',
    'HERMES_INFERENCE_MODEL',
    'HERMES_INFERENCE_BASE_URL',
    'HERMES_INFERENCE_API_KEY',
    'GLM_API_KEY',
    'ZAI_API_KEY',
    'Z_AI_API_KEY',
    'GLM_BASE_URL',
  ];
  const runtimeEnvExports = runtimeEnvKeys
    .filter((key) => runtimeEnv[key])
    .map((key) => `export ${key}=${shellQuote(runtimeEnv[key])}`)
    .join('\n');

  const script = `#!/bin/zsh
set -e
export PATH=${shellQuote(buildHermesSearchPath())}
export HERMES_CONFIG_PATH=${shellQuote(deps.hermesEngineManager.getConfigPath())}
export HERMES_DOTENV_PATH=${shellQuote(deps.hermesEngineManager.getEnvPath())}
export API_SERVER_ENABLED=true
export API_SERVER_HOST=127.0.0.1
export API_SERVER_PORT=${shellQuote(String(safePort))}
export API_SERVER_KEY=${shellQuote(token)}
export HERMES_GATEWAY_TOKEN=${shellQuote(token)}
export HERMES_GATEWAY_PORT=${shellQuote(String(safePort))}
${runtimeEnvExports ? `${runtimeEnvExports}\n` : ''}
exec ${shellQuote(commandPath)} gateway
`;
  atomicWriteText(paths.scriptPath, script, 0o700);
  atomicWriteText(paths.envPath, `HERMES_DOTENV_PATH=${shellQuote(deps.hermesEngineManager.getEnvPath())}\n`, 0o600);
  deps.hermesEngineManager.setSecretEnvVars({});
  return deps.hermesEngineManager.getConfigPath();
};

export const getFeishuRuntimeOwnershipStatus = (
  engineKey: FeishuEngineKeyType,
  ownership: FeishuRuntimeOwnershipType,
): FeishuRuntimeOwnershipStatus => {
  if (!isSupportedEngine(engineKey)) {
    return {
      engineKey,
      ownership,
      launchAgentInstalled: false,
      launchAgentLoaded: false,
      launchAgentLabel: null,
      plistPath: null,
      scriptPath: null,
      configPath: null,
      message: 'Local runtime ownership is not supported for this engine.',
    };
  }
  const paths = buildPaths(engineKey);
  const openClaw = engineKey === FeishuEngineKey.OpenClaw;
  return {
    engineKey,
    ownership,
    launchAgentInstalled: fs.existsSync(paths.plistPath),
    launchAgentLoaded: isLaunchAgentLoaded(paths.label),
    launchAgentLabel: paths.label,
    plistPath: paths.plistPath,
    scriptPath: paths.scriptPath,
    configPath: openClaw ? resolveOpenClawSystemRuntime().configPath : path.join(os.homedir(), '.hermes', 'config.yaml'),
    message: null,
  };
};

export const transferFeishuToLocalRuntime = async (
  engineKey: FeishuEngineKeyType,
  instances: FeishuInstanceConfig[],
  deps: TransferDeps,
): Promise<FeishuRuntimeOwnershipTransferResult> => {
  try {
    if (!isSupportedEngine(engineKey)) {
      throw new Error('Local runtime ownership is only supported for OpenClaw and Hermes Agent.');
    }
    const paths = buildPaths(engineKey);
    const configPath = engineKey === FeishuEngineKey.OpenClaw
      ? writeOpenClawLocalRuntime(instances, deps, paths)
      : writeHermesLocalRuntime(instances, deps, paths);
    if (engineKey === FeishuEngineKey.OpenClaw) {
      await deps.openClawEngineManager.stopGateway();
    } else {
      await deps.hermesEngineManager.stopGateway();
    }
    writeLaunchAgent(paths);
    loadLaunchAgent(paths);
    return {
      success: true,
      status: {
        ...getFeishuRuntimeOwnershipStatus(engineKey, FeishuRuntimeOwnership.LocalRuntime),
        configPath,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to transfer Feishu to local runtime.',
    };
  }
};

export const transferFeishuToWesightRuntime = async (
  engineKey: FeishuEngineKeyType,
): Promise<FeishuRuntimeOwnershipTransferResult> => {
  try {
    if (!isSupportedEngine(engineKey)) {
      throw new Error('Runtime ownership transfer is only supported for OpenClaw and Hermes Agent.');
    }
    const paths = buildPaths(engineKey);
    unloadLaunchAgent(paths);
    removeFileIfExists(paths.plistPath);
    removeFileIfExists(paths.scriptPath);
    removeFileIfExists(paths.envPath);
    return {
      success: true,
      status: getFeishuRuntimeOwnershipStatus(engineKey, FeishuRuntimeOwnership.WesightManaged),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to transfer Feishu to WeSight runtime.',
    };
  }
};
