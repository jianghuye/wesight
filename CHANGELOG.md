# Changelog

本文档记录 WeSight 的重要变更。

发布说明应从对应版本条目生成。

## Unreleased - 2026-06-05

### 新增

- 新增 Windows installer/uninstall flow 文档，说明 assisted installer、资源解包、可选 Defender exclusion、卸载清理和 release quickstart。
- 新增 release gate 和 known issues 文档，用于记录 build/lint/test、发布说明和残余风险。
- 新增外部 CLI agent、Codex 配置、Claude settings、OpenClaw legacy session 等回归测试覆盖。

### 变更

- Windows 安装器改为 assisted mode，允许用户选择安装目录。
- Windows 安装资源改为通过 `win-resources.tar` 打包并在安装阶段解包，减少大量小文件直接由 NSIS 写入的安装开销。
- Windows 包默认不捆绑 OpenClaw runtime，与 macOS runtime 策略保持一致；需要捆绑时通过显式构建开关启用。
- Windows Defender exclusion 改为 trusted build opt-in，不再默认添加。
- 外部 CLI agent 配置稳定性增强，Codex 默认使用本地 CLI 配置，Claude Code 尽量保留本地 CLI 凭据。
- Cowork 主界面的 Agent 引擎选择器只探测当前 engine，避免打开下拉框时触发全量 CLI 探测。
- 内置 Skill 文案和脚本品牌从 LobsterAI 对齐为 WeSight。

### 修复

- 修复 Windows assisted installer 在用户选择目录之前提前删除默认安装目录的问题。
- 修复 Windows 卸载时 OpenClaw gateway 或后台 node 进程导致旧卸载器无法关闭的问题。
- 修复 Skill 解析失败时可能输出完整 Skill 内容的问题。
- 修复 OpenClaw legacy LobsterAI managed session key 的兼容问题。
- 修复 `cowork_events` 测试夹具和 SQLite migration 漂移导致的测试失败。
- 修复 external CLI environment 测试依赖慢探测导致的 timeout 风险。

### 已知问题

- Windows 和 macOS 签名、公证、checksum、SmartScreen/Gatekeeper 信任链仍未在本 PR 中闭环。
- Windows installer smoke test 仍以手动验证为主，尚未接入 `windows-latest` 自动安装/卸载验证。
- `npm run lint` 当前通过但仍有 warning 债务，主要集中在 `any`、unused vars 和 React hook deps。
- Renderer 主 bundle 体积仍偏大，拆包和 bundle budget 需要后续推进。

## 2026.6.2 - 2026-06-03

### 新增

- 新增 `docs/release-process.md`，定义最小发布流程。
- 新增根目录 `CHANGELOG.md`，作为发布说明来源。

### 变更

- 明确 changelog 条目是 release note 的生成来源。
- 明确门禁失败时不得发布稳定版；若共享候选版本，必须记录为已知问题或阻断项。

### 修复

- 本次为文档更新，不包含产品修复。

### 已知问题

- 当前基线下 `npm run lint` 尚未通过。
- 当前基线下 `npm test` 尚未通过。
