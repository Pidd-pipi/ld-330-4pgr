import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuditLogsController } from './common/audit-logs.controller';
import { AuditService } from './common/audit.service';
import { DatabaseService } from './common/database.service';
import { HealthController } from './common/health.controller';
import { AuthController } from './auth/auth.controller';
import { RolesGuard } from './auth/roles.guard';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { ModifyRequestsController } from './modify-requests/modify-requests.controller';
import { ModifyRequestsService } from './modify-requests/modify-requests.service';
import { PrescriptionsController } from './prescriptions/prescriptions.controller';
import { PrescriptionsService } from './prescriptions/prescriptions.service';
import { RecordsController } from './records/records.controller';
import { RecordsService } from './records/records.service';
import { AuthService } from './auth/auth.service';

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
    PrescriptionsController,
    ModifyRequestsController,
    AuditLogsController,
  ],
  providers: [
    AuthService,
    DatabaseService,
    AuditService,
    RecordsService,
    PrescriptionsService,
    ModifyRequestsService,
    JwtAuthGuard,
    RolesGuard,
  ],
})
export class AppModule {}
