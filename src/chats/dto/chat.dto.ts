import { BadRequestException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { Trim } from '../../common/transformers/trim.transformer';

const EMPLOYEE_ID = /^[A-Za-z0-9_-]{1,50}$/;
const EMPLOYEE_ID_MESSAGE = 'must be a valid employee ID';

export const MAX_MESSAGE_LENGTH = 2000;

/**
 * Identifies a conversation: one item + two participants (seller and one buyer).
 * The other participant is `withUserId` or its alias `peerId` (the name used in responses).
 * Buyers can omit it (defaults to the seller); sellers must specify the buyer.
 */
export class ConversationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  itemId: number;

  @IsOptional()
  @Matches(EMPLOYEE_ID, { message: `withUserId ${EMPLOYEE_ID_MESSAGE}` })
  withUserId?: string;

  /** Alias of withUserId. */
  @IsOptional()
  @Matches(EMPLOYEE_ID, { message: `peerId ${EMPLOYEE_ID_MESSAGE}` })
  peerId?: string;
}

/** Returns the other participant from `withUserId` or `peerId`; rejects conflicting values. */
export function peerOf(dto: ConversationDto): string | undefined {
  if (dto.withUserId && dto.peerId && dto.withUserId !== dto.peerId) {
    throw new BadRequestException('withUserId and peerId refer to different users; send only one');
  }
  return dto.withUserId ?? dto.peerId;
}

export class JoinChatDto extends ConversationDto {}

export class MarkReadDto extends ConversationDto {}

export class SendMessageDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  itemId: number;

  /** Optional, for clients that send it; must equal the authenticated user when provided. */
  @IsOptional()
  @Matches(EMPLOYEE_ID, { message: `senderId ${EMPLOYEE_ID_MESSAGE}` })
  senderId?: string;

  @Matches(EMPLOYEE_ID, { message: `receiverId ${EMPLOYEE_ID_MESSAGE}` })
  receiverId: string;

  @Trim()
  @IsString()
  @Length(1, MAX_MESSAGE_LENGTH)
  messageText: string;
}

export class ChatHistoryQueryDto extends ConversationDto {
  /** Cursor: return messages older than this messageId. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  beforeId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;
}

export class ConversationsQueryDto extends PaginationQueryDto {}
