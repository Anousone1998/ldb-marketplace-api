import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Item, Message, User } from '../database/entities';
import { ChatsController } from './chats.controller';
import { ChatsGateway } from './chats.gateway';
import { ChatsService } from './chats.service';
import { PeerTokenService } from './peer-token.service';

@Module({
  imports: [TypeOrmModule.forFeature([Message, Item, User]), AuthModule],
  controllers: [ChatsController],
  providers: [ChatsService, ChatsGateway, PeerTokenService],
  exports: [ChatsGateway, PeerTokenService],
})
export class ChatsModule {}
