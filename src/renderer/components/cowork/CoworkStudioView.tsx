import {
  ChevronLeftIcon,
  ChevronRightIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import {
  CoworkStudioAssetSource,
  type CoworkStudioAssetsResult,
  CoworkStudioAssetStatus,
} from '@shared/cowork/studioAssets';
import Phaser from 'phaser';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { coworkService } from '../../services/cowork';
import { i18nService } from '../../services/i18n';
import type { CoworkMessage } from '../../types/cowork';
import type { CoworkStudioAvatar, CoworkStudioSnapshot } from '../../utils/coworkStudio';
import MarkdownContent from '../MarkdownContent';
import CoworkEngineSelector from './CoworkEngineSelector';
import { CoworkStudioState } from './studioConstants';

interface CoworkStudioViewProps {
  snapshot: CoworkStudioSnapshot;
  messages?: CoworkMessage[];
  isStreaming?: boolean;
  resolveLocalFilePath?: (href: string, text: string) => string | null;
}

const STUDIO_WIDTH = 1280;
const STUDIO_HEIGHT = 720;
const SNAPSHOT_EVENT = 'wesight-studio:snapshot';
type StudioAssetUrls = Record<string, string>;

const StudioConversationItemType = {
  User: 'user',
  Assistant: 'assistant',
  Thinking: 'thinking',
  System: 'system',
  Tool: 'tool',
} as const;
type StudioConversationItemType = typeof StudioConversationItemType[keyof typeof StudioConversationItemType];

const STUDIO_AREAS: Record<CoworkStudioSnapshot['state'], { x: number; y: number }> = {
  [CoworkStudioState.Idle]: { x: 640, y: 360 },
  [CoworkStudioState.Writing]: { x: 250, y: 355 },
  [CoworkStudioState.Researching]: { x: 250, y: 355 },
  [CoworkStudioState.Executing]: { x: 1040, y: 250 },
  [CoworkStudioState.Syncing]: { x: 1120, y: 570 },
  [CoworkStudioState.Error]: { x: 1065, y: 205 },
};

const formatElapsed = (value: number | null): string => {
  if (value === null || Number.isNaN(value)) return '-';
  if (value < 1000) return `${Math.round(value)}ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(1)}s`;
  return `${(value / 60_000).toFixed(1)}m`;
};

const formatStudioTime = (timestamp: number): string => (
  new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
);

type StudioConversationItem = {
  id: string;
  type: StudioConversationItemType;
  label: string;
  content: string;
  timestamp: number;
  isActive?: boolean;
};

const getToolSummary = (message: CoworkMessage): string => {
  const toolName = typeof message.metadata?.toolName === 'string'
    ? message.metadata.toolName
    : i18nService.t('coworkStudioToolActivity');
  const input = message.metadata?.toolInput;
  if (!input || typeof input !== 'object') {
    return toolName;
  }
  const inputRecord = input as Record<string, unknown>;
  const pathValue = inputRecord.file_path ?? inputRecord.path ?? inputRecord.filePath ?? inputRecord.command ?? inputRecord.pattern;
  if (typeof pathValue === 'string' && pathValue.trim()) {
    return `${toolName} · ${pathValue.trim()}`;
  }
  return toolName;
};

const buildStudioConversationItems = (
  messages: CoworkMessage[],
  isStreaming: boolean,
): StudioConversationItem[] => {
  const items = messages
    .map((message): StudioConversationItem | null => {
      if (message.type === 'user') {
        return {
          id: message.id,
          type: StudioConversationItemType.User,
          label: i18nService.t('coworkStudioYou'),
          content: message.content,
          timestamp: message.timestamp,
        };
      }
      if (message.type === 'assistant') {
        if (message.metadata?.isThinking) {
          return {
            id: message.id,
            type: StudioConversationItemType.Thinking,
            label: i18nService.t('reasoning'),
            content: message.content || i18nService.t('coworkStudioStatusThinking'),
            timestamp: message.timestamp,
            isActive: Boolean(message.metadata?.isStreaming),
          };
        }
        if (!message.content.trim() && !message.metadata?.error) {
          return null;
        }
        return {
          id: message.id,
          type: StudioConversationItemType.Assistant,
          label: i18nService.t('coworkStudioAssistant'),
          content: message.content || String(message.metadata?.error ?? ''),
          timestamp: message.timestamp,
        };
      }
      if (message.type === 'system' && (message.content.trim() || message.metadata?.error)) {
        return {
          id: message.id,
          type: StudioConversationItemType.System,
          label: i18nService.t('coworkStudioSystem'),
          content: message.content || String(message.metadata?.error ?? ''),
          timestamp: message.timestamp,
        };
      }
      if (message.type === 'tool_use') {
        return {
          id: message.id,
          type: StudioConversationItemType.Tool,
          label: i18nService.t('coworkStudioToolActivity'),
          content: getToolSummary(message),
          timestamp: message.timestamp,
          isActive: isStreaming,
        };
      }
      return null;
    })
    .filter((item): item is StudioConversationItem => item !== null);

  return items.slice(-10);
};

const createAvatarTexture = (scene: Phaser.Scene, avatar: CoworkStudioAvatar): string => {
  const key = `engine-avatar-${avatar.id}`;
  if (scene.textures.exists(key)) {
    return key;
  }

  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  graphics.clear();
  graphics.fillStyle(0x000000, 0.22);
  graphics.fillEllipse(24, 43, 36, 8);
  graphics.fillStyle(avatar.secondaryColor, 1);
  graphics.fillRect(12, 20, 24, 18);
  graphics.fillRect(15, 36, 7, 6);
  graphics.fillRect(27, 36, 7, 6);
  graphics.fillStyle(avatar.primaryColor, 1);
  graphics.fillRect(10, 16, 28, 18);
  graphics.fillRect(14, 10, 20, 10);
  graphics.fillStyle(avatar.faceColor, 1);
  graphics.fillRect(16, 17, 16, 10);
  graphics.fillStyle(0x111827, 1);
  graphics.fillRect(19, 21, 3, 3);
  graphics.fillRect(27, 21, 3, 3);
  graphics.fillStyle(avatar.accentColor, 1);
  graphics.fillRect(13, 13, 22, 3);
  graphics.fillRect(18, 31, 12, 3);

  switch (avatar.prop) {
    case 'claw':
      graphics.fillStyle(avatar.accentColor, 1);
      graphics.fillRect(5, 24, 7, 4);
      graphics.fillRect(4, 21, 3, 3);
      graphics.fillRect(4, 28, 3, 3);
      break;
    case 'scribe':
      graphics.fillStyle(0xfdf3cf, 1);
      graphics.fillRect(34, 19, 8, 12);
      graphics.fillStyle(avatar.secondaryColor, 1);
      graphics.fillRect(36, 22, 5, 1);
      graphics.fillRect(36, 25, 4, 1);
      break;
    case 'terminal':
      graphics.fillStyle(0x0f172a, 1);
      graphics.fillRect(34, 23, 10, 8);
      graphics.fillStyle(avatar.accentColor, 1);
      graphics.fillRect(36, 25, 5, 2);
      break;
    case 'messenger':
      graphics.fillStyle(0xfff2a8, 1);
      graphics.fillRect(4, 18, 9, 7);
      graphics.fillStyle(avatar.secondaryColor, 1);
      graphics.fillRect(5, 19, 7, 1);
      graphics.fillRect(7, 21, 3, 2);
      break;
    case 'console':
      graphics.fillStyle(0x101820, 1);
      graphics.fillRect(34, 20, 10, 11);
      graphics.fillStyle(avatar.accentColor, 1);
      graphics.fillRect(36, 23, 6, 1);
      graphics.fillRect(36, 26, 4, 1);
      break;
    case 'book':
      graphics.fillStyle(0xdbeafe, 1);
      graphics.fillRect(34, 20, 9, 10);
      graphics.fillStyle(avatar.primaryColor, 1);
      graphics.fillRect(38, 20, 1, 10);
      break;
    case 'tui':
      graphics.fillStyle(0x020617, 1);
      graphics.fillRect(34, 19, 10, 12);
      graphics.fillStyle(avatar.accentColor, 1);
      graphics.fillRect(36, 22, 6, 1);
      graphics.fillRect(36, 25, 5, 1);
      graphics.fillRect(36, 28, 4, 1);
      break;
    case 'default':
    default:
      graphics.fillStyle(avatar.accentColor, 1);
      graphics.fillRect(35, 20, 7, 7);
      graphics.fillRect(37, 18, 3, 3);
      break;
  }

  graphics.generateTexture(key, 48, 48);
  graphics.destroy();
  return key;
};

const createStudioScene = (
  backgroundUrl: string | null,
  assetUrls: StudioAssetUrls,
  snapshotRef: React.MutableRefObject<CoworkStudioSnapshot>,
) => class WeSightStudioScene extends Phaser.Scene {
  private avatarSprite: Phaser.GameObjects.Sprite | null = null;
  private nameTagText: Phaser.GameObjects.Text | null = null;
  private bubbleText: Phaser.GameObjects.Text | null = null;
  private bubbleBg: Phaser.GameObjects.Graphics | null = null;
  private statusText: Phaser.GameObjects.Text | null = null;
  private currentAvatarId: string | null = null;
  private currentState: CoworkStudioSnapshot['state'] | null = null;

  constructor() {
    super('WeSightStudioScene');
  }

  preload() {
    if (backgroundUrl) {
      this.load.image('office-bg', backgroundUrl);
    }
    this.loadStudioAssets();
  }

  create() {
    this.createBackground();
    this.createStatusPanel();
    this.createAvatar(snapshotRef.current);
    this.game.events.on(SNAPSHOT_EVENT, this.applySnapshot, this);
    this.applySnapshot(snapshotRef.current);
  }

  shutdown() {
    this.game.events.off(SNAPSHOT_EVENT, this.applySnapshot, this);
  }

  private createBackground() {
    if (this.textures.exists('office-bg')) {
      const bg = this.add.image(STUDIO_WIDTH / 2, STUDIO_HEIGHT / 2, 'office-bg');
      bg.setDisplaySize(STUDIO_WIDTH, STUDIO_HEIGHT);
      bg.setDepth(0);
      this.createOfficeFurniture();
      return;
    }

    const graphics = this.add.graphics();
    graphics.fillStyle(0x2d241f, 1);
    graphics.fillRect(0, 0, STUDIO_WIDTH, STUDIO_HEIGHT);
    graphics.fillStyle(0x4a372b, 1);
    for (let y = 0; y < STUDIO_HEIGHT; y += 48) {
      graphics.fillRect(0, y, STUDIO_WIDTH, 2);
    }
    for (let x = 0; x < STUDIO_WIDTH; x += 64) {
      graphics.fillRect(x, 0, 2, STUDIO_HEIGHT);
    }
    graphics.fillStyle(0x7a563b, 1);
    graphics.fillRect(165, 420, 240, 72);
    graphics.fillRect(830, 260, 260, 92);
    graphics.fillStyle(0x263238, 1);
    graphics.fillRect(880, 185, 90, 120);
    graphics.fillRect(985, 185, 90, 120);
    graphics.fillStyle(0x6b4a33, 1);
    graphics.fillRect(530, 475, 260, 110);
    graphics.fillStyle(0xb89065, 1);
    graphics.fillRect(575, 500, 170, 52);
  }

  private createStatusPanel() {
    const panel = this.add.graphics();
    panel.fillStyle(0x101820, 0.84);
    panel.fillRoundedRect(24, 24, 340, 108, 12);
    panel.lineStyle(2, 0xf4d7a1, 0.45);
    panel.strokeRoundedRect(24, 24, 340, 108, 12);
    panel.setDepth(20);
    this.statusText = this.add.text(44, 42, '', {
      color: '#ffe6bd',
      fontFamily: 'Courier New, monospace',
      fontSize: '18px',
      lineSpacing: 8,
    });
    this.statusText.setDepth(21);
  }

  private loadStudioAssets() {
    const loadImage = (key: string, assetKey: string) => {
      const url = assetUrls[assetKey];
      if (url) {
        this.load.image(key, url);
      }
    };
    const loadSpriteSheet = (key: string, assetKey: string, frameWidth: number, frameHeight: number) => {
      const url = assetUrls[assetKey];
      if (url) {
        this.load.spritesheet(key, url, { frameWidth, frameHeight });
      }
    };

    loadImage('studio-desk', 'desk');
    loadImage('studio-sofa-idle', 'sofaIdle');
    loadImage('studio-sofa-shadow', 'sofaShadow');
    loadSpriteSheet('studio-plants', 'plants', 160, 160);
    loadSpriteSheet('studio-posters', 'posters', 160, 160);
    loadSpriteSheet('studio-coffee-machine', 'coffeeMachine', 230, 230);
    loadSpriteSheet('studio-serverroom', 'serverroom', 180, 251);
    loadSpriteSheet('studio-cats', 'cats', 160, 160);
  }

  private createOfficeFurniture() {
    if (this.textures.exists('studio-sofa-shadow')) {
      const shadow = this.add.image(670, 144, 'studio-sofa-shadow').setOrigin(0, 0);
      shadow.setDepth(8);
    }
    if (this.textures.exists('studio-sofa-idle')) {
      const sofa = this.add.image(670, 144, 'studio-sofa-idle').setOrigin(0, 0);
      sofa.setDepth(10);
    }
    if (this.textures.exists('studio-plants')) {
      [
        { x: 565, y: 178, frame: 6 },
        { x: 230, y: 185, frame: 11 },
        { x: 977, y: 496, frame: 3 },
      ].forEach((plant) => {
        const sprite = this.add.sprite(plant.x, plant.y, 'studio-plants', plant.frame).setOrigin(0.5);
        sprite.setDepth(5);
      });
    }
    if (this.textures.exists('studio-posters')) {
      const poster = this.add.sprite(252, 66, 'studio-posters', 9).setOrigin(0.5);
      poster.setDepth(4);
    }
    if (this.textures.exists('studio-coffee-machine')) {
      this.anims.create({
        key: 'studio-coffee-machine-brew',
        frames: this.anims.generateFrameNumbers('studio-coffee-machine', { start: 0, end: 95 }),
        frameRate: 12,
        repeat: -1,
      });
      const coffeeMachine = this.add.sprite(659, 397, 'studio-coffee-machine', 0).setOrigin(0.5);
      coffeeMachine.setDepth(99);
      coffeeMachine.play('studio-coffee-machine-brew');
    }
    if (this.textures.exists('studio-serverroom')) {
      this.anims.create({
        key: 'studio-serverroom-on',
        frames: this.anims.generateFrameNumbers('studio-serverroom', { start: 0, end: 39 }),
        frameRate: 6,
        repeat: -1,
      });
      const serverroom = this.add.sprite(1021, 142, 'studio-serverroom', 0).setOrigin(0.5);
      serverroom.setDepth(2);
      serverroom.play('studio-serverroom-on');
    }
    if (this.textures.exists('studio-desk')) {
      const desk = this.add.image(218, 417, 'studio-desk').setOrigin(0.5);
      desk.setDepth(70);
    }
    if (this.textures.exists('studio-cats')) {
      const cat = this.add.sprite(94, 557, 'studio-cats', 2).setOrigin(0.5);
      cat.setDepth(90);
    }
  }

  private createAvatar(snapshot: CoworkStudioSnapshot) {
    const textureKey = createAvatarTexture(this, snapshot.avatar);
    const area = STUDIO_AREAS[snapshot.state];
    this.avatarSprite = this.add.sprite(area.x, area.y, textureKey);
    this.avatarSprite.setScale(3);
    this.avatarSprite.setDepth(120);
    this.nameTagText = this.add.text(area.x, area.y - 92, snapshot.avatar.nameTag, {
      color: '#2f1d11',
      backgroundColor: '#ffe3ae',
      fontFamily: 'Courier New, monospace',
      fontSize: '15px',
      padding: { x: 8, y: 4 },
    });
    this.nameTagText.setOrigin(0.5, 0.5);
    this.nameTagText.setDepth(130);
    this.bubbleBg = this.add.graphics();
    this.bubbleBg.setDepth(128);
    this.bubbleText = this.add.text(area.x, area.y - 140, '', {
      color: '#6b3a22',
      fontFamily: 'Courier New, monospace',
      fontSize: '16px',
      wordWrap: { width: 260 },
      align: 'center',
    });
    this.bubbleText.setOrigin(0.5, 0.5);
    this.bubbleText.setDepth(129);
  }

  private applySnapshot(snapshot: CoworkStudioSnapshot) {
    if (!this.avatarSprite || !this.nameTagText || !this.bubbleText || !this.bubbleBg || !this.statusText) {
      return;
    }
    if (this.currentAvatarId !== snapshot.avatar.id) {
      this.currentAvatarId = snapshot.avatar.id;
      this.avatarSprite.setTexture(createAvatarTexture(this, snapshot.avatar));
      this.avatarSprite.setTint(0xffffff);
      this.tweens.add({
        targets: this.avatarSprite,
        alpha: { from: 0.35, to: 1 },
        duration: 220,
      });
    }

    const area = STUDIO_AREAS[snapshot.state];
    if (this.currentState !== snapshot.state) {
      this.currentState = snapshot.state;
      this.tweens.add({
        targets: [this.avatarSprite, this.nameTagText, this.bubbleText],
        x: area.x,
        duration: 520,
        ease: 'Sine.easeInOut',
      });
      this.tweens.add({
        targets: this.avatarSprite,
        y: area.y,
        duration: 520,
        ease: 'Sine.easeInOut',
      });
      this.tweens.add({
        targets: this.nameTagText,
        y: area.y - 92,
        duration: 520,
        ease: 'Sine.easeInOut',
      });
      this.tweens.add({
        targets: this.bubbleText,
        y: area.y - 140,
        duration: 520,
        ease: 'Sine.easeInOut',
      });
    }

    this.nameTagText.setText(snapshot.avatar.nameTag);
    this.bubbleText.setText(snapshot.detail);
    this.statusText.setText([
      `${snapshot.engineLabel}`,
      `${snapshot.modelLabel}`,
      `${snapshot.state.toUpperCase()} · ${snapshot.activeToolLabel ?? 'ready'}`,
    ].join('\n'));
    this.drawBubble();
  }

  private drawBubble() {
    if (!this.bubbleText || !this.bubbleBg) return;
    const bounds = this.bubbleText.getBounds();
    this.bubbleBg.clear();
    this.bubbleBg.fillStyle(0xffe4b5, 0.92);
    this.bubbleBg.lineStyle(2, 0x9f6b45, 0.58);
    this.bubbleBg.fillRoundedRect(bounds.x - 14, bounds.y - 10, bounds.width + 28, bounds.height + 20, 12);
    this.bubbleBg.strokeRoundedRect(bounds.x - 14, bounds.y - 10, bounds.width + 28, bounds.height + 20, 12);
  }
};

const StudioConversationPanel: React.FC<{
  snapshot: CoworkStudioSnapshot;
  items: StudioConversationItem[];
  isOpen: boolean;
  isStreaming: boolean;
  onToggle: () => void;
  resolveLocalFilePath?: (href: string, text: string) => string | null;
}> = ({
  snapshot,
  items,
  isOpen,
  isStreaming,
  onToggle,
  resolveLocalFilePath,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const latestItemContent = items[items.length - 1]?.content;

  useEffect(() => {
    if (!isOpen) return;
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [isOpen, items.length, latestItemContent]);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="pointer-events-auto absolute right-4 top-5 z-20 inline-flex items-center gap-2 rounded-xl border-2 border-[#9b603d] bg-[#ffe5b8] px-3 py-2 text-sm font-semibold text-[#8a4d34] shadow-[4px_4px_0_rgba(61,35,22,0.35)] transition-transform hover:-translate-y-0.5"
        aria-label={i18nService.t('coworkStudioConversationExpand')}
      >
        <ChevronLeftIcon className="h-4 w-4" />
        {i18nService.t('coworkStudioConversationPanel')}
      </button>
    );
  }

  return (
    <aside className="pointer-events-auto absolute bottom-4 right-4 top-4 z-20 flex w-[min(520px,42vw)] min-w-[360px] flex-col rounded-[18px] border-4 border-[#8b5437] bg-[#ffe6b9] p-4 text-[#7a3f2b] shadow-[0_10px_0_rgba(50,26,16,0.28),0_20px_50px_rgba(40,22,14,0.32)]">
      <button
        type="button"
        onClick={onToggle}
        className="absolute -left-[54px] top-6 flex h-[92px] w-[54px] items-center justify-center rounded-l-xl border-4 border-r-0 border-[#8b5437] bg-[#ffe6b9] text-sm font-bold text-[#a65d3c] shadow-[-4px_5px_0_rgba(50,26,16,0.22)] [writing-mode:vertical-rl]"
        aria-label={i18nService.t('coworkStudioConversationCollapse')}
      >
        {i18nService.t('coworkStudioConversationCollapseShort')}
      </button>

      <div className="flex shrink-0 items-start justify-between gap-3 border-b-2 border-[#d6a372] pb-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#a76c48]">
            {i18nService.t('coworkStudioConversationPanel')}
          </div>
          <div className="mt-1 truncate text-xl font-bold text-[#773f2a]">{snapshot.engineLabel}</div>
          <div className="mt-1 truncate text-xs text-[#986247]">
            {snapshot.modelLabel} · {snapshot.configSourceLabel}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <CoworkEngineSelector />
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#9a5f40] transition-colors hover:bg-[#f4c892]"
            aria-label={i18nService.t('coworkStudioConversationCollapse')}
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 flex shrink-0 items-center justify-center gap-4 text-xs font-semibold text-[#b77852]">
        <span className="h-px flex-1 bg-[#d6a372]" />
        <span>{formatStudioTime(Date.now())}</span>
        <span className="h-px flex-1 bg-[#d6a372]" />
      </div>

      <div ref={scrollRef} className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {items.length === 0 ? (
          <div className="rounded-xl bg-[#f5cfa1] px-4 py-5 text-sm leading-7 text-[#8d5a42]">
            {i18nService.t('coworkStudioConversationEmpty')}
          </div>
        ) : (
          items.map((item) => {
            const isUser = item.type === StudioConversationItemType.User;
            const isAssistant = item.type === StudioConversationItemType.Assistant;
            const isThinking = item.type === StudioConversationItemType.Thinking;
            return (
              <div
                key={item.id}
                className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[92%] ${
                  isUser
                    ? 'rounded-[14px_14px_4px_14px] border-2 border-[#c8895d] bg-[#ffe2b0] px-4 py-2 text-right shadow-[2px_2px_0_rgba(128,71,43,0.18)]'
                    : isAssistant
                      ? 'w-full'
                      : 'rounded-xl bg-[#f2cda2] px-3 py-2'
                }`}>
                  {!isUser && (
                    <div className="mb-1 flex items-center gap-2 text-xs font-bold text-[#ad6c47]">
                      <span>{item.label}</span>
                      {item.isActive && <span className="h-2 w-2 rounded-full bg-[#bf6942] animate-pulse" />}
                    </div>
                  )}
                  {isAssistant ? (
                    <MarkdownContent
                      content={item.content}
                      className="max-w-none text-[17px] leading-8 text-[#783f2b] prose-p:my-2 prose-li:my-1 prose-strong:text-[#6e321f]"
                      resolveLocalFilePath={resolveLocalFilePath}
                      showRevealInFolderAction
                    />
                  ) : (
                    <div className={`whitespace-pre-wrap break-words ${
                      isUser
                        ? 'text-base font-medium text-[#87472f]'
                        : isThinking
                          ? 'text-sm leading-6 text-[#8f6045]'
                          : 'text-sm leading-6 text-[#8f6045]'
                    }`}>
                      {item.content}
                    </div>
                  )}
                  {isUser && (
                    <div className="mt-1 text-[11px] text-[#b77a57]">
                      {item.label} · {formatStudioTime(item.timestamp)}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-3 flex shrink-0 items-center gap-2 border-t-2 border-[#d6a372] pt-3 text-sm text-[#9a5f40]">
        <span className={`h-2.5 w-2.5 rounded-full ${isStreaming ? 'animate-pulse bg-[#b9623f]' : 'bg-[#d3a47c]'}`} />
        <span>{isStreaming ? i18nService.t('coworkStudioStatusThinking') : i18nService.t('coworkStudioStatusIdle')}</span>
        <Cog6ToothIcon className={`h-5 w-5 ${isStreaming ? 'animate-spin' : ''}`} />
      </div>
    </aside>
  );
};

const CoworkStudioView: React.FC<CoworkStudioViewProps> = ({
  snapshot,
  messages = [],
  isStreaming = false,
  resolveLocalFilePath,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const snapshotRef = useRef(snapshot);
  const [assets, setAssets] = useState<CoworkStudioAssetsResult | null>(null);
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);
  const [isConversationPanelOpen, setIsConversationPanelOpen] = useState(messages.length > 0);
  const previousMessageCountRef = useRef(messages.length);
  snapshotRef.current = snapshot;

  const conversationItems = useMemo(
    () => buildStudioConversationItems(messages, isStreaming),
    [isStreaming, messages],
  );

  useEffect(() => {
    if (messages.length > previousMessageCountRef.current && messages.length > 0) {
      setIsConversationPanelOpen(true);
    }
    previousMessageCountRef.current = messages.length;
  }, [messages.length]);

  useEffect(() => {
    let mounted = true;
    setIsLoadingAssets(true);
    coworkService.ensureStudioAssets()
      .then((result) => {
        if (!mounted) return;
        setAssets(result);
      })
      .catch((error) => {
        if (!mounted) return;
        setAssets({
          success: false,
          status: CoworkStudioAssetStatus.Error,
          source: CoworkStudioAssetSource.StarOfficeUi,
          commit: '',
          baseUrl: null,
          backgroundUrl: null,
          assetUrls: {},
          cachedFiles: [],
          attribution: '',
          licenseUrl: '',
          error: error instanceof Error ? error.message : 'Failed to load studio assets',
        });
      })
      .finally(() => {
        if (mounted) setIsLoadingAssets(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const backgroundUrl = assets?.backgroundUrl ?? null;
  const assetUrls = useMemo(() => assets?.assetUrls ?? {}, [assets]);
  useEffect(() => {
    const node = containerRef.current;
    if (!node || gameRef.current) return;
    if (isLoadingAssets) return;

    const SceneClass = createStudioScene(backgroundUrl, assetUrls, snapshotRef);
    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      parent: node,
      width: STUDIO_WIDTH,
      height: STUDIO_HEIGHT,
      backgroundColor: '#1d1b22',
      pixelArt: true,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: STUDIO_WIDTH,
        height: STUDIO_HEIGHT,
      },
      scene: SceneClass,
    });

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, [assetUrls, backgroundUrl, isLoadingAssets]);

  useEffect(() => {
    gameRef.current?.events.emit(SNAPSHOT_EVENT, snapshot);
  }, [snapshot]);

  const assetNotice = useMemo(() => {
    if (isLoadingAssets) return i18nService.t('coworkStudioLoadingAssets');
    if (assets?.status === CoworkStudioAssetStatus.Error) {
      return i18nService.t('coworkStudioAssetsFallback');
    }
    return assets?.attribution || i18nService.t('coworkStudioAssetAttribution');
  }, [assets, isLoadingAssets]);

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-[#17171b]">
      <div ref={containerRef} className="h-full w-full overflow-hidden" />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 p-4">
        <div className="rounded-xl border border-[#f0c985]/40 bg-[#14110f]/80 px-4 py-3 text-[#ffe5bd] shadow-lg backdrop-blur-sm">
          <div className="text-xs uppercase tracking-[0.18em] opacity-70">
            {i18nService.t('coworkStudio')}
          </div>
          <div className="mt-1 text-sm font-semibold">{snapshot.detail}</div>
          <div className="mt-2 text-xs opacity-70">{assetNotice}</div>
        </div>
        <div className={`pointer-events-auto min-w-[260px] rounded-xl border border-[#f0c985]/50 bg-[#fff1d6]/95 p-3 text-[#5b321d] shadow-xl ${isConversationPanelOpen ? 'hidden' : ''}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-70">
                {i18nService.t('coworkStudioCurrentAgent')}
              </div>
              <div className="mt-1 truncate text-base font-bold">{snapshot.engineLabel}</div>
              <div className="mt-1 truncate text-xs opacity-75">
                {snapshot.modelLabel} · {snapshot.configSourceLabel}
              </div>
            </div>
            <CoworkEngineSelector />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
            <div className="rounded-lg bg-[#f9dba7] px-2 py-1.5">
              <div className="font-semibold">{snapshot.todoCount}</div>
              <div className="opacity-70">{i18nService.t('coworkActivityTodos')}</div>
            </div>
            <div className="rounded-lg bg-[#f9dba7] px-2 py-1.5">
              <div className="font-semibold">{snapshot.fileChangeCount}</div>
              <div className="opacity-70">{i18nService.t('coworkActivityFileChanges')}</div>
            </div>
            <div className="rounded-lg bg-[#f9dba7] px-2 py-1.5">
              <div className="font-semibold">{formatElapsed(snapshot.elapsedMs)}</div>
              <div className="opacity-70">{i18nService.t('coworkActivityRuntimeElapsed')}</div>
            </div>
          </div>
        </div>
      </div>
      <StudioConversationPanel
        snapshot={snapshot}
        items={conversationItems}
        isOpen={isConversationPanelOpen}
        isStreaming={isStreaming}
        onToggle={() => setIsConversationPanelOpen((value) => !value)}
        resolveLocalFilePath={resolveLocalFilePath}
      />
    </div>
  );
};

export default CoworkStudioView;
