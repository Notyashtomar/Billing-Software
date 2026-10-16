import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { AdminCompaniesService } from '../services/admin-companies.service';

@Controller('admin-companies')
export class AdminCompaniesController {
  constructor(private readonly adminCompaniesService: AdminCompaniesService) {}

  @Get('options')
  @Public()
  listOptions() {
    return this.adminCompaniesService.listOptions();
  }
}
