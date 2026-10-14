import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Admin, AdminSchema } from '../../admin/schema/admin.schema';
import { User, UserSchema } from '../../user/schema/user.schema';
import { AdminPanelStationScopeService } from './admin-panel-station-scope.service';
import { StationContextService } from './station-context.service';

/**
 * Global module exposing the request-scoped {@link StationContextService} so
 * any module can inject the current station context without re-importing.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Admin.name, schema: AdminSchema },
    ]),
  ],
  providers: [StationContextService, AdminPanelStationScopeService],
  exports: [StationContextService, AdminPanelStationScopeService],
})
export class StationModule {}
