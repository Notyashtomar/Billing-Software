import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ADMIN_ROLES } from '../../auth/enums/roles.enum';
import { CreateTrainingMatrixDto } from '../dto/create-training-matrix.dto';
import { TrainingMatrixService } from '../services/training-matrix.service';

@Controller('training-matrix')
export class TrainingMatrixController {
  constructor(private readonly trainingMatrixService: TrainingMatrixService) {}

  @Post()
  @Roles(...ADMIN_ROLES)
  create(@Body() dto: CreateTrainingMatrixDto) {
    return this.trainingMatrixService.create(dto);
  }

  @Get()
  findAll(@Query('filter') filter?: string) {
    return this.trainingMatrixService.findAll(filter);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.trainingMatrixService.findOne(id);
  }

  @Patch(':id')
  @Roles(...ADMIN_ROLES)
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateTrainingMatrixDto>,
  ) {
    return this.trainingMatrixService.update(id, dto);
  }

  @Delete(':id')
  @Roles(...ADMIN_ROLES)
  remove(@Param('id') id: string) {
    return this.trainingMatrixService.remove(id);
  }
}
