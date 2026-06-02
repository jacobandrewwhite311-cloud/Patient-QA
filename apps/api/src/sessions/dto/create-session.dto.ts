import { IsIn, IsString } from 'class-validator';

export class CreateSessionDto {
  @IsString()
  @IsIn(['A', 'B'])
  group!: string;
}
