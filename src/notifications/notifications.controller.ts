import { Controller, Get, Param, ParseIntPipe, Patch, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ResponseMessage('Notifications retrieved')
  findMine(@CurrentUser('userId') userId: string, @Query() query: ListNotificationsQueryDto) {
    return this.notificationsService.findMine(userId, query);
  }

  @Get('unread-count')
  @ResponseMessage('Unread count retrieved')
  async unreadCount(@CurrentUser('userId') userId: string) {
    return { count: await this.notificationsService.countUnread(userId) };
  }

  @Patch('read-all')
  @ResponseMessage('All notifications marked as read')
  markAllRead(@CurrentUser('userId') userId: string) {
    return this.notificationsService.markAllRead(userId);
  }

  @Patch(':id/read')
  @ResponseMessage('Notification marked as read')
  markRead(@Param('id', ParseIntPipe) id: number, @CurrentUser('userId') userId: string) {
    return this.notificationsService.markRead(userId, String(id));
  }
}
