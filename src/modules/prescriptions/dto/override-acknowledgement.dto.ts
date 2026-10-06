import { IsBoolean, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class OverrideAcknowledgementDto {
  @ApiProperty({
    example: true,
    description: 'Explicit electronic acknowledgement of the severe drug safety conflict',
  })
  @IsNotEmpty()
  @IsBoolean()
  isAcknowledged!: boolean;

  @ApiProperty({
    example: 'Patient closely monitored for bleeding; co-prescription clinically indicated for acute cardiac prophylaxis.',
    description: 'Detailed clinical justification provided by the doctor for overriding severe conflict',
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(10, { message: 'Clinical justification must be at least 10 characters long' })
  clinicalJustification!: string;
}
