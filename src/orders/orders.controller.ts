import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AttachPaymentSlipDto } from './dto/attach-payment-slip.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';
import { ResponseMessage } from '../common/decorators/response-message.decorator';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ResponseMessage('Order placed')
  create(@CurrentUser('userId') userId: string, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(userId, dto);
  }

  @Get()
  @ResponseMessage('Orders retrieved')
  findMine(@CurrentUser('userId') userId: string, @Query() query: ListOrdersQueryDto) {
    return this.ordersService.findMine(userId, query);
  }

  @Get(':id')
  @ResponseMessage('Order retrieved')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser('userId') userId: string) {
    return this.ordersService.findOneForUser(String(id), userId);
  }

  @Patch(':id/status')
  @ResponseMessage('Order status updated')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(String(id), userId, dto.status);
  }

  @Patch(':id/payment-slip')
  @ResponseMessage('Payment slip attached')
  attachPaymentSlip(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('userId') userId: string,
    @Body() dto: AttachPaymentSlipDto,
  ) {
    return this.ordersService.attachPaymentSlip(String(id), userId, dto.paymentSlipUrl);
  }
}
