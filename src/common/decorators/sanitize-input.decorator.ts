import { applyDecorators, UsePipes } from '@nestjs/common';
import { SanitizePipe } from '../pipes/sanitize.pipe';

export function SanitizeInput() {
  return applyDecorators(UsePipes(new SanitizePipe()));
}
