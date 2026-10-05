import { Module, Global } from '@nestjs/common';
import { PaginationService } from './pagination.service.js';
import { PaginationBenchmarkService } from './pagination.benchmark.js';

@Global()
@Module({
  providers: [PaginationService, PaginationBenchmarkService],
  exports: [PaginationService, PaginationBenchmarkService],
})
export class PaginationModule {}
