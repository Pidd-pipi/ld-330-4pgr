import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CreateModifyRequestDto, ModifyRequestsService } from './modify-requests.service';
import { AllowedRoles, RolesGuard } from '../auth/roles.guard';
import { JwtAuthGuard, JwtUser } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ROLES } from '../common/constants';

@Controller()
@UseGuards(JwtAuthGuard)
export class ModifyRequestsController {
  constructor(private readonly modifyRequestsService: ModifyRequestsService) {}

  /** 医生在某病历下发起处方修改申请（必须填写原因） */
  @UseGuards(RolesGuard)
  @AllowedRoles(ROLES.doctor, ROLES.admin)
  @Post('records/:id/modify-requests')
  create(
    @Param('id') id: string,
    @Body() body: CreateModifyRequestDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.modifyRequestsService.create(Number(id), body, user);
  }

  /** 某病历的申请留痕 */
  @Get('records/:id/modify-requests')
  listByRecord(@Param('id') id: string) {
    return this.modifyRequestsService.listByRecord(Number(id));
  }

  /** 管理员：全部申请（可按状态过滤） */
  @UseGuards(RolesGuard)
  @AllowedRoles(ROLES.admin)
  @Get('modify-requests')
  list(@Query('status') status?: string) {
    return this.modifyRequestsService.list(status);
  }

  /** 管理员批准：仅解锁该病历一次 */
  @UseGuards(RolesGuard)
  @AllowedRoles(ROLES.admin)
  @Post('modify-requests/:id/approve')
  approve(
    @Param('id') id: string,
    @Body() body: { note?: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.modifyRequestsService.review(Number(id), true, body?.note, user);
  }

  /** 管理员驳回 */
  @UseGuards(RolesGuard)
  @AllowedRoles(ROLES.admin)
  @Post('modify-requests/:id/reject')
  reject(
    @Param('id') id: string,
    @Body() body: { note?: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.modifyRequestsService.review(Number(id), false, body?.note, user);
  }
}
