import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Public } from 'src/common/decorators/public.decorator';
import { UpdateBillingKycFormDto } from '../dto/billing-kyc.dto';
import { BillingKycService } from '../services/billing-kyc.service';

/**
 * Public airline self-serve KYC — token-gated, no FRIS session.
 */
@Public()
@Controller('billing/kyc/invite')
export class BillingKycInviteController {
  constructor(private readonly kycService: BillingKycService) {}

  @Get(':token')
  get(@Param('token') token: string) {
    return this.kycService.getByInviteToken(token);
  }

  @Patch(':token')
  save(@Param('token') token: string, @Body() dto: UpdateBillingKycFormDto) {
    return this.kycService.saveFormByInviteToken(token, dto);
  }

  @Post(':token/submit')
  submit(@Param('token') token: string) {
    return this.kycService.submitByInviteToken(token);
  }

  @Post(':token/documents')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  upload(
    @Param('token') token: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('docType') docType: string,
  ) {
    return this.kycService.addDocumentByInviteToken(
      token,
      file,
      docType || 'other',
    );
  }
}
