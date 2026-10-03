import { ApiProperty } from '@nestjs/swagger';

/**
 * User entity matching the Prisma User model.
 * Used for Swagger documentation and type safety in the service layer.
 */
export class User {
  @ApiProperty({ example: 'clxyz1234567890' })
  id!: string;

  @ApiProperty({ example: 'john@example.com' })
  email!: string;

  @ApiProperty({ example: 'John Doe' })
  name!: string;

  /** Password hash — never serialised to responses */
  password!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
