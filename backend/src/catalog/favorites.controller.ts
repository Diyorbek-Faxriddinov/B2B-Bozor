import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, CurrentUser, type AuthUser } from '../auth/auth.decorators';
import { notFound } from '../common/errors';
import { toProductWithCompany } from '../common/serialize';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('favorites')
@Controller('favorites')
@Auth()
export class FavoritesController {
  constructor(private readonly prisma: PrismaService) {}

  private async ids(userId: string) {
    const rows = await this.prisma.favorite.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { productId: true } });
    return rows.map((r) => r.productId);
  }

  @Get()
  async list(@CurrentUser() u: AuthUser) {
    const rows = await this.prisma.favorite.findMany({
      where: { userId: u.id },
      orderBy: { createdAt: 'desc' },
      include: { product: { include: { company: true } } },
    });
    return rows.map((r) => toProductWithCompany(r.product));
  }

  @Get('ids')
  idsOf(@CurrentUser() u: AuthUser) {
    return this.ids(u.id);
  }

  @Post(':productId')
  @HttpCode(200)
  async toggle(@CurrentUser() u: AuthUser, @Param('productId') productId: string) {
    const key = { userId_productId: { userId: u.id, productId } };
    const existing = await this.prisma.favorite.findUnique({ where: key });
    if (existing) {
      await this.prisma.favorite.delete({ where: key });
    } else {
      if (!(await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true } }))) throw notFound('PRODUCT_NOT_FOUND', 'Product not found');
      await this.prisma.favorite.create({ data: { userId: u.id, productId } });
    }
    return { favorited: !existing, ids: await this.ids(u.id) };
  }
}
