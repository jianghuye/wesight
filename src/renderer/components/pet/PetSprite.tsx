import './PetSprite.css';

import {
  PetMotion,
  type PetMotion as PetMotionType,
  PetVariant,
  type PetVariant as PetVariantType,
} from '@shared/pet/constants';
import React from 'react';

export const PetMood = {
  Idle: 'idle',
  Happy: 'happy',
  Focus: 'focus',
  Dragging: 'dragging',
  Walking: 'walking',
  Thinking: 'thinking',
  Working: 'working',
  Coding: 'coding',
  Done: 'done',
  Error: 'error',
} as const;

export type PetMood = typeof PetMood[keyof typeof PetMood];

type PetPalette = {
  shell: string;
  shellDark: string;
  face: string;
  faceDark: string;
  accent: string;
  blush: string;
  line: string;
};

const PET_PALETTES: Record<PetVariantType, PetPalette> = {
  [PetVariant.WeSightAgent]: {
    shell: '#fff0c5',
    shellDark: '#f59e0b',
    face: '#112925',
    faceDark: '#071c19',
    accent: '#facc15',
    blush: '#22d3ee',
    line: '#0b201c',
  },
  [PetVariant.BlueBot]: {
    shell: '#4169e1',
    shellDark: '#1e3a8a',
    face: '#1f2937',
    faceDark: '#111827',
    accent: '#60a5fa',
    blush: '#a5b4fc',
    line: '#0f172a',
  },
  [PetVariant.AquaDrop]: {
    shell: '#38bdf8',
    shellDark: '#0e7490',
    face: '#e0f2fe',
    faceDark: '#bae6fd',
    accent: '#06b6d4',
    blush: '#fb7185',
    line: '#075985',
  },
  [PetVariant.FlameBuddy]: {
    shell: '#fb923c',
    shellDark: '#c2410c',
    face: '#fff7ed',
    faceDark: '#fed7aa',
    accent: '#ef4444',
    blush: '#fda4af',
    line: '#7c2d12',
  },
  [PetVariant.WoodBox]: {
    shell: '#d6a86c',
    shellDark: '#8b5e34',
    face: '#fef3c7',
    faceDark: '#fde68a',
    accent: '#84cc16',
    blush: '#f9a8d4',
    line: '#422006',
  },
  [PetVariant.SproutBox]: {
    shell: '#e7d37f',
    shellDark: '#a16207',
    face: '#fef9c3',
    faceDark: '#fde68a',
    accent: '#65a30d',
    blush: '#fda4af',
    line: '#3f3f1f',
  },
  [PetVariant.StackBot]: {
    shell: '#6b7280',
    shellDark: '#374151',
    face: '#4b5563',
    faceDark: '#1f2937',
    accent: '#a78bfa',
    blush: '#c4b5fd',
    line: '#111827',
  },
  [PetVariant.AstroBot]: {
    shell: '#e5e7eb',
    shellDark: '#94a3b8',
    face: '#0284c7',
    faceDark: '#0f172a',
    accent: '#22d3ee',
    blush: '#f0abfc',
    line: '#0f172a',
  },
  [PetVariant.ShadowBot]: {
    shell: '#111827',
    shellDark: '#020617',
    face: '#1f2937',
    faceDark: '#030712',
    accent: '#ef4444',
    blush: '#f43f5e',
    line: '#000000',
  },
};

interface PetSpriteProps {
  variant: PetVariantType;
  motion?: PetMotionType;
  mood?: PetMood;
  size?: number;
  className?: string;
}

const renderEyes = (palette: PetPalette, mood: PetMood) => {
  if (mood === PetMood.Happy) {
    return (
      <>
        <path d="M42 48 L47 44 L52 48" fill="none" stroke={palette.accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M68 48 L73 44 L78 48" fill="none" stroke={palette.accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </>
    );
  }

  if (mood === PetMood.Focus) {
    return (
      <>
        <rect x="42" y="44" width="10" height="8" rx="2" fill={palette.accent} />
        <rect x="68" y="44" width="10" height="8" rx="2" fill={palette.accent} />
      </>
    );
  }

  return (
    <>
      <rect className="pet-sprite__eye" x="43" y="43" width="8" height="10" rx="2" fill={palette.accent} />
      <rect className="pet-sprite__eye pet-sprite__eye--right" x="69" y="43" width="8" height="10" rx="2" fill={palette.accent} />
    </>
  );
};

const renderMouth = (palette: PetPalette, mood: PetMood) => {
  if (mood === PetMood.Happy) {
    return <path d="M54 61 C58 68 66 68 70 61" fill="none" stroke={palette.accent} strokeWidth="3" strokeLinecap="round" />;
  }
  if (mood === PetMood.Dragging) {
    return <path d="M57 62 H68" stroke={palette.accent} strokeWidth="3" strokeLinecap="round" />;
  }
  return <path d="M57 61 C60 64 65 64 68 61" fill="none" stroke={palette.accent} strokeWidth="3" strokeLinecap="round" />;
};

const renderWeSightExpression = (mood: PetMood) => {
  if (mood === PetMood.Error) {
    return (
      <>
        <path
          className="pet-sprite__brand-expression"
          d="M43 49 L53 58 M53 49 L43 58 M67 49 L77 58 M77 49 L67 58"
          fill="none"
          stroke="#f97316"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M53 66 C58 62 65 62 70 66"
          fill="none"
          stroke="#facc15"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </>
    );
  }

  if (mood === PetMood.Coding || mood === PetMood.Working) {
    return (
      <>
        <rect className="pet-sprite__brand-expression" x="43" y="48" width="9" height="8" rx="2" fill="#facc15" />
        <rect className="pet-sprite__brand-expression pet-sprite__brand-expression--right" x="68" y="48" width="9" height="8" rx="2" fill="#facc15" />
        <path
          d="M55 63 H66"
          fill="none"
          stroke="#67e8f9"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </>
    );
  }

  if (mood === PetMood.Thinking) {
    return (
      <>
        <circle className="pet-sprite__brand-expression" cx="45" cy="53" r="3.5" fill="#facc15" />
        <circle className="pet-sprite__brand-expression" cx="60" cy="53" r="3.5" fill="#67e8f9" />
        <circle className="pet-sprite__brand-expression pet-sprite__brand-expression--right" cx="75" cy="53" r="3.5" fill="#facc15" />
      </>
    );
  }

  if (mood === PetMood.Done) {
    return (
      <path
        className="pet-sprite__brand-expression"
        d="M42 54 C47 45 53 45 58 55 C63 66 73 62 80 50"
        fill="none"
        stroke="#facc15"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }

  if (mood === PetMood.Focus) {
    return (
      <>
        <path
          className="pet-sprite__brand-expression"
          d="M42 56 C48 49 54 49 59 56 C64 63 70 63 78 56"
          fill="none"
          stroke="#facc15"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          className="pet-sprite__brand-expression pet-sprite__brand-expression--right"
          d="M42 48 H52 M68 48 H78"
          fill="none"
          stroke="#67e8f9"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </>
    );
  }

  if (mood === PetMood.Happy) {
    return (
      <path
        className="pet-sprite__brand-expression"
        d="M39 54 C46 41 54 64 60 58 C66 64 74 41 81 54"
        fill="none"
        stroke="#facc15"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }

  if (mood === PetMood.Dragging) {
    return (
      <path
        className="pet-sprite__brand-expression"
        d="M43 55 H53 M67 55 H77"
        fill="none"
        stroke="#facc15"
        strokeWidth="4"
        strokeLinecap="round"
      />
    );
  }

  return (
    <path
      className="pet-sprite__brand-expression"
      d="M40 54 C47 42 55 64 60 58 C65 64 73 42 80 54"
      fill="none"
      stroke="#facc15"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
};

const WeSightAgentSprite: React.FC<{
  motion: PetMotionType;
  mood: PetMood;
  size: number;
  className: string;
}> = ({ motion, mood, size, className }) => {
  const spriteClassName = [
    'pet-sprite',
    'pet-sprite--wesight',
    motion === PetMotion.Playful ? 'pet-sprite--playful' : '',
    mood === PetMood.Happy ? 'pet-sprite--happy' : '',
    mood === PetMood.Dragging ? 'pet-sprite--dragging' : '',
    mood === PetMood.Walking ? 'pet-sprite--walking' : '',
    mood === PetMood.Thinking ? 'pet-sprite--thinking' : '',
    mood === PetMood.Working ? 'pet-sprite--working' : '',
    mood === PetMood.Coding ? 'pet-sprite--coding' : '',
    mood === PetMood.Done ? 'pet-sprite--done' : '',
    mood === PetMood.Error ? 'pet-sprite--error' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <svg
      className={spriteClassName}
      width={size}
      height={size}
      viewBox="0 0 120 140"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      shapeRendering="geometricPrecision"
    >
      <defs>
        <radialGradient id="wesight-pet-face" cx="50%" cy="38%" r="70%">
          <stop offset="0" stopColor="#203b35" />
          <stop offset="1" stopColor="#071c19" />
        </radialGradient>
        <linearGradient id="wesight-pet-shell" x1="18" y1="24" x2="101" y2="82" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff7dc" />
          <stop offset="0.62" stopColor="#ffe9b0" />
          <stop offset="1" stopColor="#f3c977" />
        </linearGradient>
        <linearGradient id="wesight-pet-body" x1="34" y1="70" x2="88" y2="124" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#173d36" />
          <stop offset="1" stopColor="#061c18" />
        </linearGradient>
        <radialGradient id="wesight-pet-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fffbe8" />
          <stop offset="0.46" stopColor="#facc15" />
          <stop offset="1" stopColor="#f97316" />
        </radialGradient>
      </defs>

      <ellipse cx="60" cy="127" rx="32" ry="8" fill="rgba(15, 23, 42, 0.18)" />
      <path d="M50 24 C52 12 68 12 70 24" fill="#f59e0b" stroke="#7c3d00" strokeWidth="2" />
      <circle cx="19" cy="55" r="13" fill="#f59e0b" stroke="#7c3d00" strokeWidth="2" />
      <circle cx="101" cy="55" r="13" fill="#f59e0b" stroke="#7c3d00" strokeWidth="2" />

      <g className="pet-sprite__arm-left">
        <path d="M35 82 C22 88 19 101 28 107" fill="none" stroke="#071c19" strokeWidth="7" strokeLinecap="round" />
        <path d="M23 96 C20 101 22 108 28 110 C34 112 39 107 38 101 C34 103 28 101 23 96Z" fill="#fff0c5" stroke="#7c3d00" strokeWidth="2" />
        <path d="M25 93 C29 99 35 101 39 99" fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
      </g>
      <g className="pet-sprite__arm-right">
        <path d="M85 82 C98 88 101 101 92 107" fill="none" stroke="#071c19" strokeWidth="7" strokeLinecap="round" />
        <path d="M97 96 C100 101 98 108 92 110 C86 112 81 107 82 101 C86 103 92 101 97 96Z" fill="#fff0c5" stroke="#7c3d00" strokeWidth="2" />
        <path d="M95 93 C91 99 85 101 81 99" fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
      </g>

      <path d="M36 76 C39 62 81 62 84 76 C90 108 77 124 60 124 C43 124 30 108 36 76Z" fill="url(#wesight-pet-body)" stroke="#071c19" strokeWidth="3" />
      <g className="pet-sprite__leg-left">
        <path d="M36 116 C40 106 54 107 57 118 C53 127 36 128 31 121 C31 119 33 117 36 116Z" fill="#fff0c5" stroke="#7c3d00" strokeWidth="2" />
        <path d="M32 121 C39 128 52 127 57 119" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
      </g>
      <g className="pet-sprite__leg-right">
        <path d="M84 116 C80 106 66 107 63 118 C67 127 84 128 89 121 C89 119 87 117 84 116Z" fill="#fff0c5" stroke="#7c3d00" strokeWidth="2" />
        <path d="M88 121 C81 128 68 127 63 119" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
      </g>

      <path d="M21 54 C21 34 37 23 60 23 C83 23 99 34 99 54 C99 75 80 86 60 86 C40 86 21 75 21 54Z" fill="url(#wesight-pet-shell)" stroke="#7c3d00" strokeWidth="2.5" />
      <path d="M31 54 C31 39 43 32 60 32 C77 32 89 39 89 54 C89 69 75 76 60 76 C45 76 31 69 31 54Z" fill="url(#wesight-pet-face)" stroke="#071c19" strokeWidth="2.5" />
      <path d="M60 32 V47" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="60" cy="52" r="9" fill="#183934" stroke="#31564f" strokeWidth="3" />
      <circle className="pet-sprite__spark" cx="60" cy="52" r="5" fill="#67e8f9" />
      {renderWeSightExpression(mood)}
      <circle cx="35" cy="71" r="3" fill="#f59e0b" opacity="0.42" />
      <circle cx="85" cy="71" r="3" fill="#f59e0b" opacity="0.42" />

      <circle className="pet-sprite__brand-chest" cx="60" cy="91" r="12" fill="#fff0c5" stroke="#7c3d00" strokeWidth="2" />
      <circle className="pet-sprite__brand-chest-glow" cx="60" cy="91" r="7" fill="url(#wesight-pet-glow)" />
      {(mood === PetMood.Coding || mood === PetMood.Working) && (
        <g className="pet-sprite__keyboard">
          <rect x="36" y="105" width="48" height="15" rx="4" fill="#0f172a" stroke="#7c3d00" strokeWidth="2" />
          <path d="M44 111 H48 M53 111 H57 M62 111 H66 M71 111 H75 M48 116 H72" stroke="#67e8f9" strokeWidth="1.7" strokeLinecap="round" opacity="0.86" />
        </g>
      )}
    </svg>
  );
};

const VariantAccessory: React.FC<{ variant: PetVariantType; palette: PetPalette }> = ({ variant, palette }) => {
  switch (variant) {
    case PetVariant.AquaDrop:
      return (
        <path d="M60 5 C77 24 86 40 81 52 C76 66 45 66 39 52 C34 39 43 23 60 5Z" fill={palette.shell} stroke={palette.line} strokeWidth="2.5" />
      );
    case PetVariant.FlameBuddy:
      return (
        <>
          <path d="M60 8 C70 18 73 28 66 36 C67 28 57 26 60 14 C48 23 47 33 54 39 C42 34 45 18 60 8Z" fill="#facc15" stroke={palette.line} strokeWidth="2" />
          <path d="M61 18 C66 25 65 31 60 35 C61 29 55 27 58 20Z" fill="#ef4444" opacity="0.92" />
        </>
      );
    case PetVariant.SproutBox:
      return (
        <>
          <path d="M60 21 V34" stroke={palette.line} strokeWidth="3" strokeLinecap="round" />
          <path d="M59 21 C48 12 38 13 34 21 C45 24 53 23 59 21Z" fill="#86efac" stroke={palette.line} strokeWidth="2" />
          <path d="M61 21 C72 10 82 11 86 19 C76 24 67 23 61 21Z" fill="#65a30d" stroke={palette.line} strokeWidth="2" />
        </>
      );
    case PetVariant.StackBot:
      return (
        <>
          <rect x="50" y="11" width="20" height="10" rx="3" fill={palette.shellDark} stroke={palette.line} strokeWidth="2" />
          <circle className="pet-sprite__spark" cx="60" cy="8" r="3" fill={palette.accent} />
        </>
      );
    case PetVariant.AstroBot:
      return (
        <>
          <path d="M60 12 V27" stroke={palette.line} strokeWidth="3" strokeLinecap="round" />
          <circle className="pet-sprite__spark" cx="60" cy="10" r="4" fill={palette.accent} />
        </>
      );
    case PetVariant.ShadowBot:
      return (
        <path d="M53 18 C56 9 67 9 69 18 C72 20 74 24 74 29 H48 C48 24 50 20 53 18Z" fill={palette.shellDark} stroke={palette.line} strokeWidth="2" />
      );
    default:
      return (
        <path d="M47 24 C50 16 70 16 73 24" fill="none" stroke={palette.line} strokeWidth="3" strokeLinecap="round" />
      );
  }
};

const PetSprite: React.FC<PetSpriteProps> = ({
  variant,
  motion = PetMotion.Calm,
  mood = PetMood.Idle,
  size = 128,
  className = '',
}) => {
  if (variant === PetVariant.WeSightAgent) {
    return (
      <WeSightAgentSprite
        motion={motion}
        mood={mood}
        size={size}
        className={className}
      />
    );
  }

  const palette = PET_PALETTES[variant];
  const isDrop = variant === PetVariant.AquaDrop;
  const isWoodLike = variant === PetVariant.WoodBox || variant === PetVariant.SproutBox;
  const spriteClassName = [
    'pet-sprite',
    motion === PetMotion.Playful ? 'pet-sprite--playful' : '',
    mood === PetMood.Happy ? 'pet-sprite--happy' : '',
    mood === PetMood.Dragging ? 'pet-sprite--dragging' : '',
    mood === PetMood.Walking ? 'pet-sprite--walking' : '',
    mood === PetMood.Thinking ? 'pet-sprite--thinking' : '',
    mood === PetMood.Working ? 'pet-sprite--working' : '',
    mood === PetMood.Coding ? 'pet-sprite--coding' : '',
    mood === PetMood.Done ? 'pet-sprite--done' : '',
    mood === PetMood.Error ? 'pet-sprite--error' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <svg
      className={spriteClassName}
      width={size}
      height={size}
      viewBox="0 0 120 140"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      shapeRendering="geometricPrecision"
    >
      <ellipse cx="60" cy="127" rx="30" ry="8" fill="rgba(15, 23, 42, 0.18)" />
      <VariantAccessory variant={variant} palette={palette} />

      <g className="pet-sprite__arm-left">
        <path d="M33 75 C20 77 17 90 25 96" fill="none" stroke={palette.line} strokeWidth="5" strokeLinecap="round" />
        <circle cx="24" cy="96" r="5" fill={palette.shell} stroke={palette.line} strokeWidth="2" />
      </g>
      <g className="pet-sprite__arm-right">
        <path d="M87 75 C100 77 103 90 95 96" fill="none" stroke={palette.line} strokeWidth="5" strokeLinecap="round" />
        <circle cx="96" cy="96" r="5" fill={palette.shell} stroke={palette.line} strokeWidth="2" />
      </g>

      <rect x="34" y="72" width="52" height="48" rx="14" fill={palette.shell} stroke={palette.line} strokeWidth="3" />
      <rect x="43" y="83" width="34" height="18" rx="7" fill={palette.faceDark} opacity="0.22" />
      <rect className="pet-sprite__leg-left" x="43" y="116" width="12" height="13" rx="5" fill={palette.shellDark} stroke={palette.line} strokeWidth="2" />
      <rect className="pet-sprite__leg-right" x="65" y="116" width="12" height="13" rx="5" fill={palette.shellDark} stroke={palette.line} strokeWidth="2" />

      {isDrop ? (
        <path d="M60 27 C77 47 87 60 84 76 C81 94 40 94 36 76 C33 60 43 47 60 27Z" fill={palette.shell} stroke={palette.line} strokeWidth="3" />
      ) : isWoodLike ? (
        <rect x="33" y="33" width="54" height="44" rx="11" fill={palette.face} stroke={palette.line} strokeWidth="3" />
      ) : (
        <rect x="31" y="28" width="58" height="52" rx="16" fill={palette.shell} stroke={palette.line} strokeWidth="3" />
      )}

      <rect x="38" y="36" width="44" height="33" rx="10" fill={palette.face} stroke={palette.line} strokeWidth="3" />
      <rect x="40" y="38" width="40" height="29" rx="8" fill={palette.faceDark} opacity={variant === PetVariant.ShadowBot ? 0.82 : 0.92} />
      {renderEyes(palette, mood)}
      {renderMouth(palette, mood)}
      <circle cx="35" cy="64" r="4" fill={palette.blush} opacity="0.75" />
      <circle cx="85" cy="64" r="4" fill={palette.blush} opacity="0.75" />

      {variant === PetVariant.WoodBox && (
        <path d="M43 32 C49 23 72 23 78 32" fill="none" stroke={palette.line} strokeWidth="3" strokeLinecap="round" />
      )}
      {variant === PetVariant.ShadowBot && (
        <g fill={palette.accent}>
          <rect x="49" y="54" width="5" height="5" rx="1" />
          <rect x="58" y="54" width="5" height="5" rx="1" />
          <rect x="67" y="54" width="5" height="5" rx="1" />
        </g>
      )}
    </svg>
  );
};

export default PetSprite;
