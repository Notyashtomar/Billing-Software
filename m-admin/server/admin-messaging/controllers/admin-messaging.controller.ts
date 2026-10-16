import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '../../auth/enums/roles.enum';
import {
  QueryMessagingDto,
  TestEmailDto,
  TestOtpDto,
} from '../dto/query-messaging.dto';
import { AdminMessagingService } from '../services/admin-messaging.service';

const MESSAGING_VIEWER_ROLES = [Role.SUPER_ADMIN, Role.MANAGER] as const;

@Controller('admin/messaging')
@Roles(...MESSAGING_VIEWER_ROLES)
export class AdminMessagingController {
  constructor(private readonly messagingService: AdminMessagingService) {}

  @Get('kpis')
  getKpis(@Query() query: QueryMessagingDto) {
    return this.messagingService.getKpis(query);
  }

  @Get('otp-health')
  getOtpHealth(@Query() query: QueryMessagingDto) {
    return this.messagingService.getOtpHealth(query);
  }

  @Get('otp-failures')
  getOtpFailures(@Query() query: QueryMessagingDto) {
    return this.messagingService.getOtpFailures(query);
  }

  @Get('otp-security')
  getOtpSecurity(@Query() query: QueryMessagingDto) {
    return this.messagingService.getOtpSecurity(query);
  }

  @Get('email-delivery')
  getEmailDelivery(@Query() query: QueryMessagingDto) {
    return this.messagingService.getEmailDelivery(query);
  }

  @Get('deliverability')
  getDeliverability(@Query() query: QueryMessagingDto) {
    return this.messagingService.getDeliverability(query);
  }

  @Get('queues')
  getQueues() {
    return this.messagingService.getQueues();
  }

  @Get('activity')
  listActivity(@Query() query: QueryMessagingDto) {
    return this.messagingService.listActivity(query);
  }

  @Get('failures')
  listFailures(@Query() query: QueryMessagingDto) {
    return this.messagingService.listFailures(query);
  }

  @Get('messages/:messageId')
  getMessage(@Param('messageId') messageId: string) {
    return this.messagingService.getMessageById(messageId);
  }

  @Get('charts')
  getCharts(@Query() query: QueryMessagingDto) {
    return this.messagingService.getCharts(query);
  }

  @Get('alerts')
  getAlerts() {
    return this.messagingService.getAlerts();
  }

  @Get('templates')
  getTemplates() {
    return this.messagingService.getTemplates();
  }

  @Post('test-email')
  sendTestEmail(@Body() body: TestEmailDto) {
    return this.messagingService.sendTestEmail(body.toEmail);
  }

  @Post('test-otp')
  sendTestOtp(@Body() body: TestOtpDto) {
    return this.messagingService.sendTestOtp(body.toEmail);
  }

  @Get('export')
  async export(
    @Query() query: QueryMessagingDto,
    @Query('format') format: 'csv' | 'xlsx' | 'pdf' = 'csv',
    @Res() res: Response,
  ) {
    const payload = await this.messagingService.exportActivity(query, format);
    res.setHeader('Content-Type', payload.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${payload.filename}"`);
    res.send(payload.content);
  }
}
