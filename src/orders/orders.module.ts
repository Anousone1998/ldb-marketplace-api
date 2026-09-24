import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Item, Order } from '../database/entities';
import { StorageModule } from '../storage/storage.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order, Item]), StorageModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
