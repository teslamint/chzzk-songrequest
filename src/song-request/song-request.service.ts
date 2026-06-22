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

  /**
   * Retrieves a list of song requests based on the provided parameters.
   * @param params - Parameters for filtering, pagination, and sorting.
   * @returns A promise that resolves to an array of SongRequest objects.
   */
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

  /**
   * Retrieves all song requests for a specific channel.
   * @param channelId - The ID of the channel.
   * @returns A promise that resolves to an array of SongRequest objects.
   */
  async requestsByChannelId(channelId: string): Promise<SongRequest[]> {
    return this.requests({
      where: { channel_id: channelId },
      orderBy: { id: 'asc' },
    });
  }

  /**
   * Counts the number of pending song requests for a specific channel.
   * @param channelId - The ID of the channel.
   * @returns A promise that resolves to the count of pending song requests.
   */
  async requestCountByChannelId(channelId: string): Promise<number> {
    return this.prisma.songRequest.count({
      where: { channel_id: channelId, status: 'PENDING' },
    });
  }

  /**
   * Calculates the total duration of pending song requests for a specific channel.
   * @param channelId - The ID of the channel.
   * @returns A promise that resolves to the sum of play times.
   */
  async requestTotalDurationByChannelId(
    channelId: string,
  ): Promise<{ _sum: { play_time: bigint } }> {
    return this.prisma.songRequest.aggregate({
      _sum: { play_time: true },
      where: { channel_id: channelId, status: 'PENDING' },
    });
  }

  /**
   * Retrieves the last pending song request made by a specific user in a channel.
   * @param channelId - The ID of the channel.
   * @param requestedBy - The user ID of the requester.
   * @returns A promise that resolves to the last pending SongRequest or null.
   */
  async lastRequestByUser(
    channelId: string,
    requestedBy: string,
  ): Promise<SongRequest | null> {
    return this.prisma.songRequest.findFirst({
      where: {
        channel_id: channelId,
        requested_by: requestedBy,
        status: 'PENDING',
      },
      take: 1,
      orderBy: { id: 'desc' },
    });
  }

  /**
   * Creates a new song request.
   * @param data - The data for the new song request.
   * @returns A promise that resolves to the created SongRequest.
   */
  async createRequest(
    data: Prisma.SongRequestCreateInput,
  ): Promise<SongRequest> {
    data.id = ulid();
    this.logger.debug('Creating song request with data:', data);
    const request = await this.prisma.songRequest.create({ data });
    this.eventEmitter.emit(
      'songRequest.created',
      new SongRequestCreatedEvent(request),
    );
    return request;
  }

  /**
   * Deletes a song request.
   * @param where - The unique identifier for the song request.
   * @returns A promise that resolves to the deleted SongRequest.
   */
  async deleteRequest(
    where: Prisma.SongRequestWhereUniqueInput,
  ): Promise<SongRequest> {
    const deleted = await this.prisma.songRequest.delete({ where });
    if (deleted.status === 'PENDING') {
      this.eventEmitter.emit(
        'songRequest.deleted',
        new SongRequestDeletedEvent(deleted),
      );
    }
    return deleted;
  }

  /**
   * Sets the status of a song request to 'PLAYING'.
   * @param data - The ID and channelId of the song request.
   */
  async setPlaying(data: { id: string; channelId: string }): Promise<void> {
    await this.prisma.songRequest.update({
      data: { status: 'PLAYING' },
      where: { id: data.id, channel_id: data.channelId },
    });
  }

  /**
   * Retrieves the currently playing song for a specific channel.
   * @param channelId - The ID of the channel.
   * @returns A promise that resolves to the currently playing SongRequest or null.
   */
  async getCurrentSong(channelId: string): Promise<SongRequest | null> {
    return this.prisma.songRequest.findFirst({
      where: { channel_id: channelId, status: 'PLAYING' },
      take: 1,
      orderBy: { id: 'asc' },
    });
  }

  /**
   * Skips the currently playing song.
   * @param song - The SongRequest to skip.
   */
  async skipSong(song: SongRequest): Promise<void> {
    if (song == null) {
      return;
    }
    await this.deleteRequest({ id: song.id, channel_id: song.channel_id });
    this.eventEmitter.emit(
      'songRequest.skipped',
      new SongRequestSkippedEvent(song),
    );
  }

  /**
   * Reverts all 'PLAYING' song requests to 'PENDING' for a given channel.
   * @param data - The channelId.
   */
  async revertToPending(data: { channelId: string }): Promise<void> {
    if (data === null) {
      return;
    }
    await this.prisma.songRequest.updateMany({
      data: { status: 'PENDING' },
      where: { channel_id: data.channelId, status: 'PLAYING' },
    });
  }

  /**
   * Clears all pending song requests for a given channel.
   * @param channelId - The ID of the channel.
   */
  async clearQueue(channelId: string): Promise<void> {
    await this.prisma.songRequest.deleteMany({
      where: { channel_id: channelId, status: 'PENDING' },
    });
  }

  /**
   * Retrieves a song request from the queue based on its order.
   * @param channelId - The ID of the channel.
   * @param order - The order of the song in the queue.
   * @returns A promise that resolves to the SongRequest at the specified order or null.
   */
  async getSong(
    channelId: string,
    order?: number,
  ): Promise<SongRequest | null> {
    if (!order) {
      return null;
    }
    return this.prisma.songRequest.findFirst({
      where: { channel_id: channelId, status: 'PENDING' },
      take: 1,
      skip: order - 1,
      orderBy: { id: 'asc' },
    });
  }
}
