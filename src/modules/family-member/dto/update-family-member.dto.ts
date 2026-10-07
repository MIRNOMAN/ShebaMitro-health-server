import { PartialType } from '@nestjs/swagger';
import { CreateFamilyMemberDto } from './create-family-member.dto.js';

export class UpdateFamilyMemberDto extends PartialType(CreateFamilyMemberDto) {}
