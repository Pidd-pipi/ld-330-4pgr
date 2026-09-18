import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { AuditLogsController } from './common/audit-logs.controller';
import { AuditService } from './common/audit.service';
import { DatabaseService } from './common/database.service';
import { HealthController } from './common/health.controller';
import { ModificationRequestsController } from './modifications/modification-requests.controller';
import { ModificationRequestsService } from './modifications/modification-requests.service';
import { RecordsController } from './records/records.controller';
import { RecordsService } from './records/records.service';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET ?? 'local_dev_secret',
      signOptions: { expiresIn: '8h' },
    }),
  ],
  controllers: [
    HealthController,
    AuthController,
    RecordsController,
    ModificationRequestsController,
    AuditLogsController,
  ],
  providers: [
    AuthService,
    DatabaseService,
    AuditService,
    RecordsService,
    ModificationRequestsService,
  ],
})
export class AppModule {}
