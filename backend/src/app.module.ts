import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { env } from './config/env';
import { ApiExceptionFilter } from './common/exception.filter';
import { PrismaModule } from './prisma/prisma.service';
import { SharedModule } from './shared/shared.module';
import { AuthGuard } from './auth/auth.guard';
import { AuthController } from './auth/auth.controller';
import { UsersController } from './users/users.controller';
import { UploadsController } from './users/uploads.controller';
import { CatalogController } from './catalog/catalog.controller';
import { FavoritesController } from './catalog/favorites.controller';
import { OrdersService } from './orders/orders.service';
import { CourierController, OrdersController } from './orders/orders.controller';
import { SellerController } from './seller/seller.controller';
import { RfqsController } from './rfqs/rfqs.controller';
import { ConversationsController, NotificationsController } from './messaging/messaging.controller';
import { AiService } from './ai/ai.service';
import { AiController } from './ai/ai.controller';
import { AdminController } from './admin/admin.controller';
import { PaymentsService } from './payments/payments.service';
import { PaymentsController } from './payments/payments.controller';
import { MiscController } from './misc/misc.controller';

@Module({
  imports: [
    PrismaModule,
    SharedModule,
    ScheduleModule.forRoot(),
    // generous global limit; sensitive routes override with @Throttle
    ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: env().NODE_ENV === 'test' ? 100_000 : 300 }] }),
  ],
  controllers: [
    AuthController,
    UsersController,
    UploadsController,
    CatalogController,
    FavoritesController,
    OrdersController,
    CourierController,
    SellerController,
    RfqsController,
    NotificationsController,
    ConversationsController,
    AiController,
    AdminController,
    PaymentsController,
    MiscController,
  ],
  providers: [
    OrdersService,
    AiService,
    PaymentsService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
