import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateItemDto } from './dto/create-item.dto';
import { ListItemsQueryDto } from './dto/list-items-query.dto';
import { UpdateItemStatusDto } from './dto/update-item-status.dto';
import { ItemsService } from './items.service';
import { ResponseMessage } from '../common/decorators/response-message.decorator';

@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Get()
  @ResponseMessage('Items retrieved')
  findAll(@Query() query: ListItemsQueryDto) {
    return this.itemsService.findAll(query);
  }

  @Post()
  @ResponseMessage('Item created')
  create(@CurrentUser('userId') userId: string, @Body() dto: CreateItemDto) {
    return this.itemsService.create(userId, dto);
  }

  @Get(':id')
  @ResponseMessage('Item retrieved')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.itemsService.findOne(String(id));
  }

  @Patch(':id/status')
  @ResponseMessage('Item status updated')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateItemStatusDto,
  ) {
    return this.itemsService.updateStatus(String(id), userId, dto.status);
  }
}
