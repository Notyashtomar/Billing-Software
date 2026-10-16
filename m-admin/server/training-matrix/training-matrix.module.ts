import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TrainingMatrixController } from './controllers/training-matrix.controller';
import {
  TrainingMatrix,
  TrainingMatrixSchema,
} from './schema/training-matrix.schema';
import { TrainingMatrixService } from './services/training-matrix.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TrainingMatrix.name, schema: TrainingMatrixSchema },
    ]),
  ],
  controllers: [TrainingMatrixController],
  providers: [TrainingMatrixService],
  exports: [TrainingMatrixService],
})
export class TrainingMatrixModule {}
