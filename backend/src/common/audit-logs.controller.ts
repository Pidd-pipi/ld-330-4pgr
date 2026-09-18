import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard, JwtUser } from './jwt-auth.guard';
import { ROLES } from './constants';
import { Roles } from './roles.decorator';
import { ModificationRequestsService } from '../modifications/modification-requests.service';

@UseGuards(JwtAuthGuard)
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly service: ModificationRequestsService) {}

  @Get()
  @Roles(ROLES.admin)
  list(@Query('limit') limit?: string, @CurrentUser() _user?: JwtUser) {
    return this.service.listAuditLogs(limit ? Number(limit) : 100);
  }
}
