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
import { PrescriptionDto, RecordsService } from './records.service';

@UseGuards(JwtAuthGuard)
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

  @Post('patients')
  createPatient(@Body() body: Parameters<RecordsService['createPatient']>[0]) {
    return this.recordsService.createPatient(body);
  }

  @Get('patients/:id/timeline')
  timeline(@Param('id') id: string) {
    return this.recordsService.timeline(Number(id));
  }

  @Post('patients/:id/records')
  @Roles(ROLES.doctor, ROLES.admin)
  createRecord(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.recordsService.createRecord(Number(id), user);
  }

  // ---- 归档病历处方留痕闭环 ----

  @Get('records/:id')
  recordDetail(@Param('id') id: string) {
    return this.recordsService.recordDetail(Number(id));
  }

  @Get('records/:id/prescriptions')
  prescriptions(@Param('id') id: string) {
    return this.recordsService.listPrescriptions(Number(id));
  }

  @Post('records/:id/archive')
  @Roles(ROLES.doctor, ROLES.admin)
  archive(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.recordsService.archiveRecord(Number(id), user);
  }

  @Post('records/:id/prescriptions')
  @Roles(ROLES.doctor)
  savePrescriptions(
    @Param('id') id: string,
    @Body() body: { prescriptions: PrescriptionDto[] },
    @CurrentUser() user: JwtUser,
  ) {
    return this.recordsService.savePrescriptions(Number(id), body?.prescriptions ?? [], user);
  }

  @Get('records/:id/prescription-versions')
  versions(@Param('id') id: string) {
    return this.recordsService.listVersions(Number(id));
  }
}
