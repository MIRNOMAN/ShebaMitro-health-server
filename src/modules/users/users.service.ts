import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import { BCRYPT_SALT_ROUNDS } from '../../common/constants/index.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto) {
    const { password, ...rest } = createUserDto;
    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    return this.prisma.user.create({
      data: {
        ...rest,
        passwordHash,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    return user;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    await this.findOne(id); // ensure exists

    const { password, avatar, ...rest } = updateUserDto as any;
    const data: any = { ...rest };
    if (password) {
      data.passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      ...updated,
      avatar: avatar ?? undefined,
    };
  }

  async saveAvatar(userId: string, file: Express.Multer.File) {
    const uploadDir = path.join(process.cwd(), 'uploads', 'avatars');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const ext = path.extname(file.originalname || '') || '.jpg';
    const cleanExt = ext.startsWith('.') ? ext : `.${ext}`;
    const safeUserId = (userId || 'user').replace(/[^a-zA-Z0-9_-]/g, '');
    const fileName = `${safeUserId}-${Date.now()}${cleanExt}`;
    const filePath = path.join(uploadDir, fileName);

    fs.writeFileSync(filePath, file.buffer);

    const relativeUrl = `/uploads/avatars/${fileName}`;
    const fullUrl = `http://localhost:5100${relativeUrl}`;

    return {
      url: fullUrl,
      fileName,
    };
  }

  async remove(id: string) {
    await this.findOne(id); // ensure exists

    return this.prisma.user.delete({
      where: { id },
    });
  }
}
