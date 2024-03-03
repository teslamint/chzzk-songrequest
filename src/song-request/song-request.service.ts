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
        status: {
          not: 'FINISHED',
        },
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
    this.eventEmitter.emit(
      'songRequest.deleted',
      new SongRequestDeletedEvent(deleted),
    );
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

  async firstPendingRequestByChannelId(channelId: string) {
    return this.prisma.songRequest.findFirst({
      where: {
        channel_id: channelId,
        status: 'PENDING',
      },
      take: 1,
      orderBy: {
        id: 'asc',
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
    song.status = 'FINISHED';
    this.eventEmitter.emit(
      'songRequest.skipped',
      new SongRequestSkippedEvent(song),
    );
  }
}
