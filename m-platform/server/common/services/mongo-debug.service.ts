import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';

@Injectable()
export class MongoDebugService implements OnModuleInit {
  private readonly logger = new Logger(MongoDebugService.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  async onModuleInit(): Promise<void> {
    try {
      const state = this.connection.readyState;
      const dbName = this.connection.db?.databaseName ?? 'unknown';
      this.logger.log(`Mongo connection state=${state} db=${dbName}`);
      const db = this.connection.db;
      if (!db) {
        this.logger.warn('Mongo db handle not ready while logging collections');
        return;
      }
      const cols = await db.listCollections().toArray();
      const names = cols.map((c) => c.name).sort();
      this.logger.log(
        `Mongo collections (${names.length}): ${names.join(', ')}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`Mongo debug init failed: ${msg}`);
    }
  }
}
