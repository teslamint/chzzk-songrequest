import { Injectable, Logger } from '@nestjs/common';
import ytdl from 'ytdl-core';
import { SongRequestService } from '../song-request/song-request.service';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { ChatMessageEvent, SendChatMessageEvent } from './chat-bot.events';

@Injectable()
export class ChatBotService {
  private readonly logger = new Logger(ChatBotService.name);
  private readonly aliases: { alias: string; command: string }[] = [];
  private readonly commands: {
    command: string;
    func: (event: ChatMessageEvent, args?: string) => void | Promise<void>;
  }[] = [];

  constructor(
    private eventEmitter: EventEmitter2,
    private songRequestService: SongRequestService,
  ) {
    this.registerCommands();
    this.registerAliases();
  }

  async callCommand(cmd: string, args: string, event: ChatMessageEvent) {
    const _isAlias = this.aliases.find((alias) => alias.alias == cmd);
    if (_isAlias) {
      cmd = _isAlias.command;
    }
    const _cmd = this.commands.find((command) => command.command == cmd);
    if (_cmd) {
      return _cmd.func(event, args);
    } else {
      // command not found
      this.logger.debug(`command not found: ${cmd}`);
    }
  }

  @OnEvent('chat.connect')
  private async handleConnectEvent(event: {
    service: string;
    channelId: string;
  }) {
    this.logger.debug('response to chat.connect event');
    this.sendChat(event.service, event.channelId, '구우봇이 연결되었습니다.');
  }

  @OnEvent('chat.message')
  private async handleMessageEvent(event: ChatMessageEvent) {
    this.logger.debug('chat.message event received', { ...event });
    if (!event.message.startsWith('!')) {
      // ignore not started exclamation mark
      return;
    }
    // split chat message
    const [command, args] = event.message.split(/\s/, 2);
    this.logger.debug(`call command: ${command}, ${args}`);
    await this.callCommand(command, args, event);
  }

  private sendChat(service: string, channelId: string, message: string) {
    this.eventEmitter.emit(
      'chat.send',
      new SendChatMessageEvent({
        service: service,
        channelId: channelId,
        message: message,
      }),
    );
  }

  private readonly _songRequest = async (
    event: ChatMessageEvent,
    url: string,
  ) => {
    // youtube URL 체크
    try {
      const mention = event.nickname ? `@${event.nickname}: ` : '';
      if (!url || url.trim() == '') {
        this.sendChat(
          event.service,
          event.channelId,
          `${mention}주소를 입력해주세요.`,
        );
        return;
      }
      // validate video ID
      if (!ytdl.validateURL(url) && !ytdl.validateID(url)) {
        this.sendChat(
          event.service,
          event.channelId,
          `${mention}입력한 주소가 올바르지 않습니다.`,
        );
        return;
      }
      const info = await ytdl.getInfo(ytdl.getURLVideoID(url));
      // normalize url
      url = 'https://www.youtube.com/watch?v=' + ytdl.getVideoID(url);
      const allowedToEmbed =
        info.videoDetails.isCrawlable && !info.videoDetails.isPrivate;
      this.logger.debug('요청 곡 정보', {
        url: url,
        title: info.videoDetails.title,
        length: info.videoDetails.lengthSeconds,
        is_family_safe: info.videoDetails.isFamilySafe,
        allowed_to_embed: allowedToEmbed,
      });
      // 임베드 허용 어부 체크
      if (!allowedToEmbed) {
        this.sendChat(
          event.service,
          event.channelId,
          `${mention}재생할 수 없는 동영상입니다.`,
        );
        return;
      }
      // 중복 체크
      const isExists = await this.songRequestService
        .requests({
          where: {
            channel_id: event.channelId,
            url: url,
          },
          take: 1,
        })
        .then((items) => {
          return items.length > 0;
        });
      if (isExists) {
        this.sendChat(
          event.service,
          event.channelId,
          `${mention}이미 대기열에 등록된 곡입니다.`,
        );
        return;
      }
      // add queue
      const item = await this.songRequestService.createRequest({
        id: '',
        service: 'YOUTUBE',
        url: url,
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
      const idx = items.findIndex((item) => item.url === url);
      if (idx !== -1) {
        this.eventEmitter.emit(
          'chat.send',
          new SendChatMessageEvent({
            service: event.service,
            channelId: event.channelId,
            message: `${mention}<${item.title}> 재생목록에 ${items.length}번째로 추가되었습니다.`,
          }),
        );
      }
    } catch (e) {
      this.logger.error(e);
    }
  };

  private readonly _songList = async (event: ChatMessageEvent) => {
    const mention = event.nickname ? `@${event.nickname}: ` : '';
    // 큐 목록 정보 전송
    const count = await this.songRequestService.requestCountByChannelId(
      event.channelId,
    );
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
  };

  private readonly _currentSong = async (event: ChatMessageEvent) => {
    const mention = event.nickname ? `@${event.nickname}: ` : '';
    // 재생중인 곡 정보를 전송한다.
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
  };

  private readonly _help = (event: ChatMessageEvent) => {
    this.sendChat(
      event.service,
      event.channelId,
      '명령어: !sr <url>, !sl, !clear, !우롱송, !명령어',
    );
  };

  private readonly _skip = async (event: ChatMessageEvent) => {
    // 위젯에 재생중인 영상을 스킵하고 다음 영상을 재생하게 한다.
    const currentSong = await this.songRequestService.getCurrentSong(
      event.channelId,
    );
    const mention = event.nickname ? `@${event.nickname}: ` : '';
    if (currentSong) {
      if (currentSong.requested_by !== event.userId) {
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
    } else {
      this.sendChat(
        event.service,
        event.channelId,
        `${mention}재생중인 곡이 없습니다.`,
      );
    }
  };

  private readonly _wrongSong = async (event: ChatMessageEvent) => {
    this.logger.debug('remove last requested song');
    // 유저가 마지막으로 등록한 곡을 대기열에서 삭제한다. 재생중인 경우는 제외한다.
    const item = await this.songRequestService.lastRequestByUser(
      event.channelId,
      event.userId,
    );
    if (item) {
      await this.songRequestService
        .deleteRequest({
          id: item.id,
        })
        .then(() => {
          this.sendChat(
            event.service,
            event.channelId,
            `${event.nickname ? '@' + event.nickname : ''}: 신청하신 ${item.title} 곡이 삭제되었습니다.`,
          );
        })
        .catch((reason) => {
          this.logger.warn('큐 삭제 실패', reason);
        });
    } else {
      this.sendChat(
        event.service,
        event.channelId,
        `${event.nickname ? '@' + event.nickname : ''}: 신청하신 곡이 없습니다.`,
      );
    }
  };

  private readonly _clear = async (event: ChatMessageEvent) => {
    // 대기열을 비운다. 스트리머만 사용할 수 있다.
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
      this.sendChat(event.service, event.channelId, '대기열을 비웠습니다.');
    } catch (e) {
      this.logger.error(`대기열 비우는 도중 에러 발생: ${e}`);
      this.sendChat(
        event.service,
        event.channelId,
        '대기열을 비우는 데 실패했습니다.',
      );
    }
  };

  private registerCommands() {
    this.commands.push(
      {
        command: '!command',
        func: this._help,
      },
      {
        command: '!wrongsong',
        func: this._wrongSong,
      },
      {
        command: '!skip',
        func: this._skip,
      },
      {
        command: '!sr',
        func: this._songRequest,
      },
      {
        command: '!sl',
        func: this._songList,
      },
      {
        command: '!cs',
        func: this._currentSong,
      },
      {
        command: '!clear',
        func: this._clear,
      },
    );
  }

  private registerAliases() {
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
    );
  }
}
