import { Injectable, Logger } from '@nestjs/common';
import { PaginationDirection } from './dto/cursor-pagination.dto.js';
import type {
  CompositeCursor,
  PageInfo,
  CursorPaginatedResult,
  PaginateOptions,
} from './interfaces/cursor-pagination.interface.js';

@Injectable()
export class PaginationService {
  private readonly logger = new Logger(PaginationService.name);

  /**
   * Encode composite cursor [createdAt, id] to Base64URL string.
   */
  encodeCursor(createdAt: Date | string, id: string): string {
    const isoString = new Date(createdAt).toISOString();
    const payload = JSON.stringify([isoString, id]);
    return Buffer.from(payload, 'utf8').toString('base64url');
  }

  /**
   * Decode Base64URL composite cursor into { createdAt, id }.
   */
  decodeCursor(cursorStr: string): CompositeCursor | null {
    if (!cursorStr || cursorStr.trim().length === 0) {
      return null;
    }
    try {
      const jsonStr = Buffer.from(cursorStr, 'base64url').toString('utf8');
      const parsed = JSON.parse(jsonStr);

      if (!Array.isArray(parsed) || parsed.length < 2) {
        return null;
      }

      const [isoString, id] = parsed;
      const createdAt = new Date(isoString);

      if (isNaN(createdAt.getTime()) || typeof id !== 'string') {
        return null;
      }

      return { createdAt, id };
    } catch (err) {
      this.logger.warn(`Failed to decode composite cursor: ${cursorStr}`);
      return null;
    }
  }

  /**
   * High-performance reusable cursor-based pagination for high-volume entities.
   */
  async paginate<T extends Record<string, any>>(
    model: { findMany: Function; count?: Function },
    options: PaginateOptions,
  ): Promise<CursorPaginatedResult<T>> {
    const {
      where = {},
      cursorDto,
      orderByField = 'createdAt',
      sortOrder = 'desc',
      include,
      select,
    } = options;

    const { cursor: rawCursor, limit = 10, direction = PaginationDirection.FORWARD } = cursorDto;

    const decodedCursor = rawCursor ? this.decodeCursor(rawCursor) : null;
    const fetchLimit = limit + 1;

    let cursorWhere: Record<string, any> = {};

    if (decodedCursor) {
      const { createdAt, id } = decodedCursor;
      const isDesc = sortOrder === 'desc';

      if (direction === PaginationDirection.FORWARD) {
        cursorWhere = {
          OR: [
            { [orderByField]: isDesc ? { lt: createdAt } : { gt: createdAt } },
            {
              AND: [
                { [orderByField]: createdAt },
                { id: isDesc ? { lt: id } : { gt: id } },
              ],
            },
          ],
        };
      } else {
        // Backward pagination
        cursorWhere = {
          OR: [
            { [orderByField]: isDesc ? { gt: createdAt } : { lt: createdAt } },
            {
              AND: [
                { [orderByField]: createdAt },
                { id: isDesc ? { gt: id } : { lt: id } },
              ],
            },
          ],
        };
      }
    }

    const combinedWhere = {
      ...where,
      ...(Object.keys(cursorWhere).length > 0 ? cursorWhere : {}),
    };

    const queryOptions: Record<string, any> = {
      where: combinedWhere,
      take: fetchLimit,
      orderBy: [
        { [orderByField]: sortOrder },
        { id: sortOrder },
      ],
    };

    if (include) queryOptions.include = include;
    if (select) queryOptions.select = select;

    const rawItems: T[] = await model.findMany(queryOptions);

    const hasNextPage = rawItems.length > limit;
    const data = hasNextPage ? rawItems.slice(0, limit) : rawItems;

    const hasPreviousPage = Boolean(decodedCursor);

    const startItem = data.length > 0 ? data[0] : null;
    const endItem = data.length > 0 ? data[data.length - 1] : null;

    const startCursor =
      startItem && startItem[orderByField] && startItem.id
        ? this.encodeCursor(startItem[orderByField], startItem.id)
        : null;

    const endCursor =
      endItem && endItem[orderByField] && endItem.id
        ? this.encodeCursor(endItem[orderByField], endItem.id)
        : null;

    const pageInfo: PageInfo = {
      startCursor,
      endCursor,
      hasNextPage,
      hasPreviousPage,
    };

    return {
      data,
      pageInfo,
    };
  }
}
