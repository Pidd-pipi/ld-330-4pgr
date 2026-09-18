import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CreatePatientDto, RecordsService } from './records.service';
import { AllowedRoles, RolesGuard } from '../auth/roles.guard';
import { JwtAuthGuard, JwtUser } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ROLES } from '../common/constants';

@Controller()
export class RecordsController {
  constructor(private readonly recordsService: RecordsService) {}

  @Get('summary')
  summary() {
    return this.recordsService.summary();
  }

  @Get('patients')
  patients(@Query('keyword') keyword?: string) {
    return this.recordsService.searchPatients(keyword);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @AllowedRoles(ROLES.doctor, ROLES.admin)
  @Post('patients')
  createPatient(@Body() body: CreatePatientDto, @CurrentUser() user: JwtUser) {
    return this.recordsService.createPatient(body, user);
  }

  @Get('patients/:id/timeline')
  timeline(@Param('id') id: string) {
    return this.recordsService.timeline(Number(id));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @AllowedRoles(ROLES.doctor, ROLES.admin)
  @Post('patients/:id/records')
  createRecord(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.recordsService.createRecord(Number(id), user);
  }

  @Get('records/:id')
  recordDetail(@Param('id') id: string) {
    return this.recordsService.recordDetail(Number(id));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @AllowedRoles(ROLES.doctor, ROLES.admin)
  @Post('records/:id/archive')
  archive(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.recordsService.archive(Number(id), user);
  }
}
