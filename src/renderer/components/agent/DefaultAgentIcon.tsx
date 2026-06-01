import { PetMotion, PetVariant } from '@shared/pet/constants';
import React from 'react';

import PetSprite, { PetMood } from '../pet/PetSprite';

interface DefaultAgentIconProps {
  size?: number;
  className?: string;
}

const DefaultAgentIcon: React.FC<DefaultAgentIconProps> = ({
  size = 22,
  className = '',
}) => (
  <span
    className={`inline-flex shrink-0 items-center justify-center ${className}`}
    aria-hidden="true"
  >
    <PetSprite
      variant={PetVariant.WeSightAgent}
      motion={PetMotion.Calm}
      mood={PetMood.Idle}
      size={size}
      className=""
    />
  </span>
);

export default DefaultAgentIcon;
