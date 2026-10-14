import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ShippedBag, ShippedBagSchema } from './schema/shipped-bag.schema';
import { ShippedBagsService } from './services/shipped-bags.service';
import { ShippedBagsController } from './controllers/shipped-bags.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ShippedBag.name, schema: ShippedBagSchema },
    ]),
  ],
  controllers: [ShippedBagsController],
  providers: [ShippedBagsService],
  exports: [ShippedBagsService],
})
export class ShippedBagsModule {}
