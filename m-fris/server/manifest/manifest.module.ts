import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Manifest, ManifestSchema } from './schema/manifest.schema';
import { ManifestService } from './services/manifest.service';
import { ManifestController } from './controllers/manifest.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Manifest.name, schema: ManifestSchema },
    ]),
  ],
  controllers: [ManifestController],
  providers: [ManifestService],
  exports: [ManifestService],
})
export class ManifestModule {}
