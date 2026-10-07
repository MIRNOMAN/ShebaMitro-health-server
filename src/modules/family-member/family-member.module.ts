import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { CaslModule } from '../../common/casl/casl.module.js';
import { FamilyMemberController } from './family-member.controller.js';
import { FamilyMemberService } from './family-member.service.js';

@Module({
  imports: [DatabaseModule, CaslModule],
  controllers: [FamilyMemberController],
  providers: [FamilyMemberService],
  exports: [FamilyMemberService],
})
export class FamilyMemberModule {}
