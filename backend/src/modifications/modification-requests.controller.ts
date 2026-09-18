import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard, JwtUser } from '../common/jwt-auth.guard';
import { ROLES } from '../common/constants';
import { Roles } from '../common/roles.decorator';
import { ModificationRequestsService } from './modification-requests.service';

@UseGuards(JwtAuthGuard)
@Controller('modification-requests')
export class ModificationRequestsController {
  constructor(private readonly service: ModificationRequestsService) {}

  @Get()
  list(@Query('status') status: string | undefined, @CurrentUser() user: JwtUser) {
    return this.service.listRequests(status, user);
  }

  @Post()
  @Roles(ROLES.doctor)
  create(
    @Body() body: { recordId: number; reason: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.createRequest(Number(body?.recordId), body?.reason ?? '', user);
  }

  @Post(':id/approve')
  @Roles(ROLES.admin)
  approve(
    @Param('id') id: string,
    @Body() body: { comment?: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.approveRequest(Number(id), body?.comment, user);
  }

  @Post(':id/reject')
  @Roles(ROLES.admin)
  reject(
    @Param('id') id: string,
    @Body() body: { comment?: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.rejectRequest(Number(id), body?.comment, user);
  }
}
