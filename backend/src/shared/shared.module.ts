import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { env } from '../config/env';
import { AuthService } from '../auth/auth.service';
import { MailService } from './mail.service';
import { NotificationsService } from './notifications.service';
import { RealtimeGateway } from './realtime.gateway';
import { SmsService } from './sms.service';

/** Cross-cutting services available to every feature module. */
@Global()
@Module({
  imports: [JwtModule.registerAsync({ useFactory: () => ({ secret: env().JWT_SECRET }) })],
  providers: [AuthService, MailService, SmsService, RealtimeGateway, NotificationsService],
  exports: [AuthService, MailService, SmsService, RealtimeGateway, NotificationsService, JwtModule],
})
export class SharedModule {}
