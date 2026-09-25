import { Body, Controller, Delete, Get, Param, Patch } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UpdateFcmTokenDto } from './dto/update-fcm-token.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';
import { ResponseMessage } from '../common/decorators/response-message.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ResponseMessage('Profile retrieved')
  getMe(@CurrentUser('userId') userId: string) {
    return this.usersService.getProfile(userId);
  }

  @Patch('me')
  @ResponseMessage('Profile updated')
  updateMe(@CurrentUser('userId') userId: string, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(userId, dto);
  }

  /** Frontend sends the token after login and whenever Firebase refreshes it. */
  @Patch('me/fcm-token')
  @ResponseMessage('FCM token updated')
  updateFcmToken(@CurrentUser('userId') userId: string, @Body() dto: UpdateFcmTokenDto) {
    return this.usersService.updateFcmToken(userId, dto.fcmToken);
  }

  @Delete('me/fcm-token')
  @ResponseMessage('FCM token removed')
  clearFcmToken(@CurrentUser('userId') userId: string) {
    return this.usersService.clearFcmToken(userId);
  }

  @Get(':userId')
  @ResponseMessage('Employee retrieved')
  getOne(@Param('userId') userId: string) {
    return this.usersService.getPublicProfile(userId);
  }
}
