import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, SongRequest } from '@prisma/client';
import { ulid } from 'ulidx';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  SongRequestCreatedEvent,
  SongRequestDeletedEvent,
  SongRequestSkippedEvent,
} from './song-request.event';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class SongRequestService {
  private readonly logger = new Logger(SongRequestService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async requests(params: {
    skip?: number;
    take?: number;
    cursor?: Prisma.SongRequestWhereUniqueInput;
    where?: Prisma.SongRequestWhereInput;
    orderBy?: Prisma.SongRequestOrderByWithRelationInput;
  }): Promise<SongRequest[]> {
    const { skip, take, cursor, where, orderBy } = params;
    return this.prisma.songRequest.findMany({
      skip,
      take,
      cursor,
      where,
      orderBy,
    });
  }

  async requestsByChannelId(channelId: string) {
    return this.requests({
      where: {
        channel_id: channelId,
      },
      orderBy: {
        id: 'asc',
      },
    });
  }

  async requestCountByChannelId(channelId: string) {
    return this.prisma.songRequest.count({
      where: {
        channel_id: channelId,
        status: 'PENDING',
      },
    });
  }

  async requestTotalDurationByChannelId(channelId: string) {
    return this.prisma.songRequest.aggregate({
      _sum: {
        play_time: true,
      },
      where: {
        channel_id: channelId,
        status: 'PENDING',
      },
    });
  }

  async lastRequestByUser(channelId: string, requestedBy: string) {
    return this.prisma.songRequest.findFirst({
      where: {
        channel_id: channelId,
        requested_by: requestedBy,
        status: 'PENDING',
      },
      take: 1,
      orderBy: {
        id: 'desc',
      },
    });
  }

  async createRequest(
    data: Prisma.SongRequestCreateInput,
  ): Promise<SongRequest> {
    data.id = ulid();
    this.logger.debug('data', data);
    const request = await this.prisma.songRequest.create({ data });
    this.eventEmitter.emit(
      'songRequest.created',
      new SongRequestCreatedEvent(request),
    );
    return request;
  }

  async deleteRequest(
    where: Prisma.SongRequestWhereUniqueInput,
  ): Promise<SongRequest> {
    const deleted = await this.prisma.songRequest.delete({
      where,
    });
    if (deleted.status === 'PENDING') {
      this.eventEmitter.emit(
        'songRequest.deleted',
        new SongRequestDeletedEvent(deleted),
      );
    }
    return deleted;
  }

  async setPlaying(data: { id: string; channelId: string }) {
    await this.prisma.songRequest.update({
      data: {
        status: 'PLAYING',
      },
      where: {
        id: data.id,
        channel_id: data.channelId,
      },
    });
  }

  async getCurrentSong(channelId: string) {
    return this.prisma.songRequest.findFirst({
      where: {
        channel_id: channelId,
        status: 'PLAYING',
      },
      take: 1,
      orderBy: {
        id: 'asc',
      },
    });
  }

  async skipSong(song: SongRequest) {
    await this.deleteRequest({
      id: song.id,
      channel_id: song.channel_id,
    });
    this.eventEmitter.emit(
      'songRequest.skipped',
      new SongRequestSkippedEvent(song),
    );
  }

  /**
   * 재생중 상태인 곡(들)을 대기중으로 되돌린다.
   * @param data
   */
  async revertToPending(data: { channelId: string }) {
    await this.prisma.songRequest.updateMany({
      data: {
        status: 'PENDING',
      },
      where: {
        channel_id: data.channelId,
        status: 'PLAYING',
      },
    });
  }

  async clearQueue(channelId: string) {
    await this.prisma.songRequest.deleteMany({
      where: {
        channel_id: channelId,
        status: 'PENDING',
      },
    });
  }

  /**
   * 대기열에서 특정 순서의 곡을 가져온다.
   * @param channelId
   * @param order
   */
  async getSong(channelId: string, order?: number) {
    if (!order) {
      return null;
    }
    return this.prisma.songRequest.findFirst({
      where: {
        channel_id: channelId,
        status: 'PENDING',
      },
      take: 1,
      skip: order - 1,
      orderBy: {
        id: 'asc',
      },
    });
  }
}
