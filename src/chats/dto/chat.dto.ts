import { BadRequestException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { Trim } from '../../common/transformers/trim.transformer';
import { PeerTokenService } from '../peer-token.service';

const EMPLOYEE_ID = /^[A-Za-z0-9_-]{1,50}$/;
const EMPLOYEE_ID_MESSAGE = 'must be a valid employee ID';
/** Employee ID or the encrypted `peerToken` returned by the chat endpoints (base64url). */
const PEER = /^[A-Za-z0-9_-]{1,128}$/;
const PEER_MESSAGE = 'must be a valid employee ID or peer token';

export const MAX_MESSAGE_LENGTH = 2000;

/**
 * Identifies a conversation: one item + two participants (seller and one buyer).
 * The other participant is `withUserId` or its alias `peerId` (the name used in responses).
 * Both accept a plain employee ID or the encrypted `peerToken`.
 * Buyers can omit it (defaults to the seller); sellers must specify the buyer.
 */
export class ConversationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  itemId: number;

  @IsOptional()
  @Matches(PEER, { message: `withUserId ${PEER_MESSAGE}` })
  withUserId?: string;

  /** Alias of withUserId. */
  @IsOptional()
  @Matches(PEER, { message: `peerId ${PEER_MESSAGE}` })
  peerId?: string;
}

/** Returns the other participant from `withUserId` or `peerId`; rejects conflicting values. */
export function peerOf(dto: ConversationDto, peerTokens: PeerTokenService): string | undefined {
  const withUserId = peerTokens.resolve(dto.withUserId);
  const peerId = peerTokens.resolve(dto.peerId);
  if (withUserId && peerId && withUserId !== peerId) {
    throw new BadRequestException('withUserId and peerId refer to different users; send only one');
  }
  return withUserId ?? peerId;
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

  @Matches(PEER, { message: `receiverId ${PEER_MESSAGE}` })
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
