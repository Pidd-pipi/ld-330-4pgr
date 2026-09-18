import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CreatePrescriptionDto, PrescriptionsService } from './prescriptions.service';
import { AllowedRoles, RolesGuard } from '../auth/roles.guard';
import { JwtAuthGuard, JwtUser } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ROLES } from '../common/constants';

@Controller('records/:id/prescriptions')
@UseGuards(JwtAuthGuard)
export class PrescriptionsController {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  @Get()
  list(@Param('id') id: string) {
    return this.prescriptionsService.listByRecord(Number(id));
  }

  @Get('versions')
  versions(@Param('id') id: string) {
    return this.prescriptionsService.versions(Number(id));
  }

  // 护士只读，不允许开具/修改处方
  @UseGuards(RolesGuard)
  @AllowedRoles(ROLES.doctor, ROLES.admin)
  @Post()
  save(
    @Param('id') id: string,
    @Body() body: CreatePrescriptionDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.prescriptionsService.save(Number(id), body, user);
  }
}
