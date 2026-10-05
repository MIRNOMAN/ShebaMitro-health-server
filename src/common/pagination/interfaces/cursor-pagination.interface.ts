import { CursorPaginationDto } from '../dto/cursor-pagination.dto.js';

export interface CompositeCursor {
  createdAt: Date;
  id: string;
}

export interface PageInfo {
  endCursor: string | null;
  hasNextPage: boolean;
  startCursor: string | null;
  hasPreviousPage: boolean;
}

export interface CursorPaginatedResult<T> {
  data: T[];
  pageInfo: PageInfo;
}

export interface PaginateOptions {
  where?: Record<string, any>;
  cursorDto: CursorPaginationDto;
  orderByField?: string;
  sortOrder?: 'asc' | 'desc';
  include?: Record<string, any>;
  select?: Record<string, any>;
}
