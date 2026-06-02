import { Injectable } from '@nestjs/common';
import { PromptVariant, PROMPT_VARIANTS } from '../common/constants';

@Injectable()
export class ExperimentService {
  assignVariant(sessionId: string): PromptVariant {
    let hash = 0;
    for (let i = 0; i < sessionId.length; i++) {
      hash = (hash << 5) - hash + sessionId.charCodeAt(i);
      hash |= 0;
    }
    const index = Math.abs(hash) % PROMPT_VARIANTS.length;
    return PROMPT_VARIANTS[index];
  }
}
