import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { BillingPageAccess } from '../common/billing-page-access.decorator';
import {
  CurrentBillingActor,
  CurrentBillingStation,
} from '../common/billing-context.decorator';
import type { StationScopeContext } from '../common/station-scope';
import {
  ApproveBillingKycDto,
  CreateBillingKycCaseDto,
  ListBillingKycQueryDto,
  RejectBillingKycDto,
  SendBillingKycInviteDto,
  UpdateBillingKycFormDto,
} from '../dto/billing-kyc.dto';
import { BillingKycService } from '../services/billing-kyc.service';

@BillingPageAccess()
@Controller('billing/kyc')
export class BillingKycController {
  constructor(private readonly kycService: BillingKycService) {}

  @Get()
  list(
    @CurrentBillingStation() station: StationScopeContext,
    @Query() query: ListBillingKycQueryDto,
  ) {
    return this.kycService.list(station, query);
  }

  @Post()
  create(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: CreateBillingKycCaseDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.kycService.create(station, dto, actor);
  }

  @Get(':id')
  findOne(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
  ) {
    return this.kycService.findOne(station, id);
  }

  @Patch(':id')
  saveForm(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @Body() dto: UpdateBillingKycFormDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.kycService.saveForm(station, id, dto, actor);
  }

  @Post(':id/invite')
  invite(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @Body() dto: SendBillingKycInviteDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.kycService.sendInvite(station, id, dto, actor);
  }

  @Post(':id/submit')
  submit(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.kycService.submit(station, id, actor);
  }

  @Post(':id/review')
  review(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.kycService.markUnderReview(station, id, actor);
  }

  @Post(':id/approve')
  approve(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @Body() dto: ApproveBillingKycDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.kycService.approve(station, id, dto, actor);
  }

  @Post(':id/reject')
  reject(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @Body() dto: RejectBillingKycDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.kycService.reject(station, id, dto, actor);
  }

  @Post(':id/documents')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadDocument(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('docType') docType: string,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.kycService.addDocument(
      station,
      id,
      file,
      docType || 'other',
      actor,
    );
  }
}
