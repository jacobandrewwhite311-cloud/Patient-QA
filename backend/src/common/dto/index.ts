import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { Cohort } from '../types';

export class SelectCohortDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['A', 'B'])
  cohort!: Cohort;
}

export class ChatMessageDto {
  @IsString()
  @IsNotEmpty()
  message!: string;
}
