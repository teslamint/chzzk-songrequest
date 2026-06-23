import { Injectable, Logger } from '@nestjs/common';
import * as ytdl from '@distube/ytdl-core';
import { SongRequestService } from '../song-request/song-request.service';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { ChatMessageEvent, SendChatMessageEvent } from './chat-bot.events';
import { SongRequestClearedEvent } from '../song-request/song-request.event';

interface Command {
  command: string;
  func: (event: ChatMessageEvent, args?: string) => void | Promise<void>;
}

interface Alias {
  alias: string;
  command: string;
}

@Injectable()
export class ChatBotService {
  private readonly logger = new Logger(ChatBotService.name);
  private readonly aliases: Alias[] = [];
  private readonly commands: Command[] = [];

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly songRequestService: SongRequestService,
  ) {
    this.registerCommands();
    this.registerAliases();
  }

  private async executeCommand(
    cmd: string,
    args: string,
    event: ChatMessageEvent,
  ): Promise<void> {
    const commandName = this.getCommandName(cmd);
    const command = this.commands.find((c) => c.command === commandName);

    if (command) {
      await command.func(event, args);
    } else {
      this.logger.debug(`Command not found: ${cmd}`);
    }
  }

  private getCommandName(aliasOrCommand: string): string {
    const alias = this.aliases.find((a) => a.alias === aliasOrCommand);
    return alias ? alias.command : aliasOrCommand;
  }

  @OnEvent('chat.connect')
  private async handleConnectEvent(event: {
    service: string;
    channelId: string;
  }): Promise<void> {
    this.logger.debug('Response to chat.connect event');
    this.sendChat(
      event.service,
      event.channelId,
      '노래신청봇이 연결되었습니다.',
    );
  }

  @OnEvent('chat.message')
  private async handleMessageEvent(event: ChatMessageEvent): Promise<void> {
    this.logger.debug('chat.message event received', { ...event });
    if (!event.message.startsWith('!')) {
      return; // Ignore messages not starting with '!'
    }

    const [command, args] = event.message.split(/\s/, 2);
    this.logger.debug(`Executing command: ${command}, with args: ${args}`);
    await this.executeCommand(command, args, event);
  }

  private sendChat(service: string, channelId: string, message: string): void {
    this.eventEmitter.emit(
      'chat.send',
      new SendChatMessageEvent({
        service: service,
        channelId: channelId,
        message: message,
      }),
    );
  }

  private async validateAndGetYoutubeInfo(
    url: string,
    mention: string,
    event: ChatMessageEvent,
  ): Promise<{ info: ytdl.videoInfo; normalizedUrl: string } | null> {
    if (!url || url.trim() == '') {
      this.sendChat(
        event.service,
        event.channelId,
        `${mention}주소를 입력해주세요.`,
      );
      return null;
    }
    // validate video ID
    if (!ytdl.validateURL(url) && !ytdl.validateID(url)) {
      this.sendChat(
        event.service,
        event.channelId,
        `${mention}입력한 주소가 올바르지 않습니다.`,
      );
      return null;
    }
    let info: ytdl.videoInfo;
    try {
      info = await ytdl.getInfo(ytdl.getURLVideoID(url));
    } catch (e) {
      this.logger.error(e);
      this.sendChat(
        event.service,
        event.channelId,
        `${mention}동영상 정보를 불러오는 데 실패했습니다. 잠시 후 다시 시도해주세요.`,
      );
      return null;
    }
    // normalize url
    const normalizedUrl =
      'https://www.youtube.com/watch?v=' + ytdl.getVideoID(url);
    return { info, normalizedUrl };
  }

  private async _songRequest(
    event: ChatMessageEvent,
    url: string,
  ): Promise<void> {
    const mention = event.nickname ? `@${event.nickname}: ` : '';

    try {
      const result = await this.validateAndGetYoutubeInfo(url, mention, event);
      if (!result) return;
      const { info, normalizedUrl } = result;

      const allowedToEmbed =
        info.videoDetails.isCrawlable && !info.videoDetails.isPrivate;
      this.logger.debug('요청 곡 정보', {
        url: normalizedUrl,
        title: info.videoDetails.title,
        length: info.videoDetails.lengthSeconds,
        is_family_safe: info.videoDetails.isFamilySafe,
        allowed_to_embed: allowedToEmbed,
      });

      if (!allowedToEmbed) {
        this.sendChat(
          event.service,
          event.channelId,
          `${mention}재생할 수 없는 동영상입니다.`,
        );
        return;
      }

      const isExists = await this.songRequestService
        .requests({
          where: {
            channel_id: event.channelId,
            url: normalizedUrl,
          },
          take: 1,
        })
        .then((items) => items.length > 0);

      if (isExists) {
        this.sendChat(
          event.service,
          event.channelId,
          `${mention}이미 대기열에 등록된 곡입니다.`,
        );
        return;
      }

      const item = await this.songRequestService.createRequest({
        id: '',
        service: 'YOUTUBE',
        url: normalizedUrl,
        title: info.videoDetails.title,
        channel_id: event.channelId,
        play_time: parseInt(info.videoDetails.lengthSeconds, 10),
        request_from: 'CHAT',
        requested_by: event.userId,
        requested_at: new Date(event.timestamp),
      });

      this.logger.debug('대기열에 곡 등록', item);
      const items = await this.songRequestService.requestsByChannelId(
        event.channelId,
      );
      const idx = items.findIndex((song) => song.url === normalizedUrl);
      if (idx !== -1) {
        this.sendChat(
          event.service,
          event.channelId,
          `${mention}<${item.title}> 재생목록에 ${items.length}번째로 추가되었습니다.`,
        );
      }
    } catch (e) {
      this.logger.error(e);
    }
  }

  private async _songList(
    event: ChatMessageEvent,
    args?: string,
  ): Promise<void> {
    const mention = event.nickname ? `@${event.nickname}: ` : '';
    const count = await this.songRequestService.requestCountByChannelId(
      event.channelId,
    );

    if (!count) {
      this.sendChat(
        event.service,
        event.channelId,
        `${mention}대기열이 비어있습니다.`,
      );
      return;
    }

    if (args) {
      await this.sendSongByOrder(event, mention, args);
      return;
    }

    await this.sendQueueSummary(event, mention, count);
  }

  private async sendSongByOrder(
    event: ChatMessageEvent,
    mention: string,
    args: string,
  ): Promise<void> {
    const order = parseInt(args, 10);
    const song = await this.songRequestService.getSong(event.channelId, order);
    if (song) {
      this.sendChat(
        event.service,
        event.channelId,
        `${mention}${order}번째 곡: ${song.title}`,
      );
    } else {
      this.sendChat(
        event.service,
        event.channelId,
        `${mention}대기열에 해당 순서의 곡이 없습니다.`,
      );
    }
  }

  private async sendQueueSummary(
    event: ChatMessageEvent,
    mention: string,
    count: number,
  ): Promise<void> {
    const totalDuration =
      await this.songRequestService.requestTotalDurationByChannelId(
        event.channelId,
      );
    const totalLength: bigint = BigInt(totalDuration._sum.play_time ?? 0);
    const totalHour = totalLength / BigInt(3600);
    const totalMinute = (totalLength % BigInt(3600)) / BigInt(60);
    const totalSecond = (totalLength % BigInt(3600)) % BigInt(60);
    let totalLengthMessage = `${totalSecond}초`;
    if (totalMinute > 0) {
      totalLengthMessage = `${totalMinute}분 ` + totalLengthMessage;
    }
    if (totalHour > 0) {
      totalLengthMessage = `${totalHour}시간 ` + totalLengthMessage;
    }
    this.sendChat(
      event.service,
      event.channelId,
      `${mention}대기열 ${count}개, 총 길이: ${totalLengthMessage}`,
    );
  }

  private async _currentSong(event: ChatMessageEvent): Promise<void> {
    const mention = event.nickname ? `@${event.nickname}: ` : '';
    const currentSong = await this.songRequestService.getCurrentSong(
      event.channelId,
    );

    if (currentSong) {
      this.sendChat(
        event.service,
        event.channelId,
        `${mention}현재 곡: ${currentSong.title}`,
      );
    } else {
      this.sendChat(
        event.service,
        event.channelId,
        `${mention}재생 중인 곡이 없습니다.`,
      );
    }
  }

  private _help(event: ChatMessageEvent): void {
    this.sendChat(
      event.service,
      event.channelId,
      '명령어: !sr <url>, !sl [number], !sd <number>, !cs, !skip, !clear, !우롱송, !명령어',
    );
  }

  private async _skip(event: ChatMessageEvent): Promise<void> {
    const currentSong = await this.songRequestService.getCurrentSong(
      event.channelId,
    );
    const mention = event.nickname ? `@${event.nickname}: ` : '';

    if (!currentSong) {
      this.sendChat(
        event.service,
        event.channelId,
        `${mention}재생중인 곡이 없습니다.`,
      );
      return;
    }

    if (
      event.role !== 'streamer' &&
      event.role !== 'manager' &&
      currentSong.requested_by !== event.userId
    ) {
      this.sendChat(
        event.service,
        event.channelId,
        `${mention}등록한 곡이 아닙니다.`,
      );
      return;
    }

    await this.songRequestService.skipSong(currentSong);
    this.sendChat(
      event.service,
      event.channelId,
      `${mention}재생 중인 ${currentSong.title} 영상을 스킵합니다.`,
    );
  }

  private async _wrongSong(event: ChatMessageEvent): Promise<void> {
    this.logger.debug('remove last requested song');
    const item = await this.songRequestService.lastRequestByUser(
      event.channelId,
      event.userId,
    );

    if (item) {
      try {
        await this.songRequestService.deleteRequest({
          id: item.id,
        });
        this.sendChat(
          event.service,
          event.channelId,
          `${
            event.nickname ? '@' + event.nickname : ''
          }: 신청하신 ${item.title} 곡이 삭제되었습니다.`,
        );
      } catch (reason) {
        this.logger.warn('Failed to delete queue item', reason);
      }
    } else {
      this.sendChat(
        event.service,
        event.channelId,
        `${
          event.nickname ? '@' + event.nickname : ''
        }: 신청하신 곡이 없습니다.`,
      );
    }
  }

  private async _clear(event: ChatMessageEvent): Promise<void> {
    if (event.role !== 'streamer' && event.role !== 'manager') {
      this.sendChat(
        event.service,
        event.channelId,
        '스트리머 혹은 매니저만 사용할 수 있습니다.',
      );
      return;
    }

    try {
      await this.songRequestService.clearQueue(event.channelId);
      this.eventEmitter.emit(
        'songRequest.cleared',
        new SongRequestClearedEvent(event.channelId),
      );
      this.sendChat(event.service, event.channelId, '대기열을 비웠습니다.');
    } catch (e) {
      this.logger.error(`Error clearing the queue: ${e}`);
      this.sendChat(
        event.service,
        event.channelId,
        '대기열을 비우는 데 실패했습니다.',
      );
    }
  }

  private async _delete(event: ChatMessageEvent, args?: string): Promise<void> {
    const order = parseInt(args, 10);
    try {
      const song = await this.songRequestService.getSong(
        event.channelId,
        order,
      );
      if (!song) {
        this.sendChat(
          event.service,
          event.channelId,
          '대기열에 해당 순서의 곡이 없습니다.',
        );
        return;
      }
      if (song.requested_by != event.userId) {
        this.sendChat(
          event.service,
          event.channelId,
          '신청한 곡만 삭제할 수 있습니다.',
        );
        return;
      }

      await this.songRequestService.deleteRequest({
        id: song.id,
      });
      this.sendChat(
        event.service,
        event.channelId,
        `${song.title} 곡을 대기열에서 삭제했습니다.`,
      );
    } catch (e) {
      this.logger.error(`Error deleting queue item: ${e}`);
      this.sendChat(
        event.service,
        event.channelId,
        '대기열 삭제 중 에러가 발생했습니다.',
      );
    }
  }

  private registerCommands(): void {
    this.commands.push(
      {
        command: '!command',
        func: this._help.bind(this),
      },
      {
        command: '!wrongsong',
        func: this._wrongSong.bind(this),
      },
      {
        command: '!skip',
        func: this._skip.bind(this),
      },
      {
        command: '!sr',
        func: this._songRequest.bind(this),
      },
      {
        command: '!sl',
        func: this._songList.bind(this),
      },
      {
        command: '!cs',
        func: this._currentSong.bind(this),
      },
      {
        command: '!clear',
        func: this._clear.bind(this),
      },
      {
        command: '!sd',
        func: this._delete.bind(this),
      },
    );
  }

  private registerAliases(): void {
    this.aliases.push(
      {
        alias: '!명령어',
        command: '!command',
      },
      {
        alias: '!help',
        command: '!command',
      },
      {
        alias: '!우롱송',
        command: '!wrongsong',
      },
      {
        alias: '!스킵',
        command: '!skip',
      },
      {
        alias: '!ㄴㄱ',
        command: '!sr',
      },
      {
        alias: '!ㅊㄴ',
        command: '!cs',
      },
      {
        alias: '!니',
        command: '!sl',
      },
      {
        alias: '!클리어',
        command: '!clear',
      },
      {
        alias: '!삭제',
        command: '!sd',
      },
    );
  }
}
