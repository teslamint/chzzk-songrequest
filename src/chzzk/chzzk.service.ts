import { Injectable, Logger } from '@nestjs/common';
import { ChatEvent, ChzzkChat, ChzzkClient } from 'chzzk';
import { ConfigService } from '@nestjs/config';
import ytdl from 'ytdl-core';
import { SongRequestService } from '../song-request/song-request.service';

@Injectable()
export class ChzzkService {
  private readonly client: ChzzkClient;
  private readonly commands: object;
  private readonly chatClients: ChzzkChat[] = [];
  private readonly logger = new Logger(ChzzkService.name);

  constructor(
    private configService: ConfigService,
    private songRequestService: SongRequestService,
  ) {
    this.client = new ChzzkClient({
      nidAuth: this.configService.get('NID_AUT'),
      nidSession: this.configService.get('NID_SES'),
    });
    const channelId = this.configService.get('CHZZK_CHANNEL_ID');
    this.chatClients[channelId] = this.initChat(channelId);
    this.commands = this.initCommands()(this.chatClients[channelId]);
    this.initChatEvent(channelId);
    this.connect(channelId);
  }

  getChatClient(channelId: string) {
    return this.chatClients[channelId] ?? null;
  }

  private initChat(channelId: string) {
    // init chat client
    return new ChzzkChat({
      client: this.client,
      channelId: channelId,
    });
  }

  private connect(channelId: string) {
    if (this.chatClients[channelId]) {
      Promise.any([this.chatClients[channelId].connect()]).then(() => {
        // do nothing
      });
    }
  }

  private initCommands() {
    return (chatClient: ChzzkChat) => ({
      sr: async (chat: ChatEvent, url: string) => {
        // youtube URL 체크
        try {
          if (!url || url.trim() == '') {
            chatClient.sendChat(
              `@${chat.profile.nickname}: 주소를 입력해주세요.`,
            );
            return;
          }
          // validate video ID
          if (!ytdl.validateURL(url) && !ytdl.validateID(url)) {
            chatClient.sendChat(
              `@${chat.profile.nickname} 입력한 주소가 올바르지 않습니다.`,
            );
            return;
          }
          const info = await ytdl.getBasicInfo(ytdl.getURLVideoID(url));
          // normalize url
          url = 'https://www.youtube.com/watch?v=' + ytdl.getVideoID(url);
          this.logger.debug('요청 곡 정보', {
            url: url,
            title: info.videoDetails.title,
            length: info.videoDetails.lengthSeconds,
            is_family_safe: info.videoDetails.isFamilySafe,
          });
          // 중복 체크
          const isExists = await this.songRequestService
            .requests({
              where: {
                channel_id: this.configService.get('CHZZK_CHANNEL_ID'),
                url: url,
              },
              take: 1,
            })
            .then((items) => {
              return items.length > 0;
            });
          if (isExists) {
            chatClient.sendChat(
              `@${chat.profile.nickname}: 이미 대기열에 등록된 곡입니다.`,
            );
            return;
          }
          // add queue
          const item = await this.songRequestService.createRequest({
            id: '',
            service: 'YOUTUBE',
            url: url,
            title: info.videoDetails.title,
            channel_id: this.configService.get('CHZZK_CHANNEL_ID'),
            play_time: parseInt(info.videoDetails.lengthSeconds, 10),
            request_from: 'CHAT',
            requested_by: chat.profile.userIdHash,
            requested_at: new Date(chat.time),
          });
          this.logger.debug('대기열에 곡 등록', item);
          const items = await this.songRequestService.requestsByChannelId(
            this.configService.get('CHZZK_CHANNEL_ID'),
          );
          const idx = items.findIndex((item) => item.url === url);
          if (idx !== -1) {
            chatClient.sendChat(
              `@${chat.profile.nickname}: <${item.title}> 재생목록에 ${items.length}번째로 추가되었습니다.`,
            );
          }
        } catch (e) {
          this.logger.error(e);
        }
      },
      sl: async (chat: ChatEvent) => {
        // 큐 목록 정보 전송
        const count = await this.songRequestService.requestCountByChannelId(
          this.configService.get('CHZZK_CHANNEL_ID'),
        );
        const totalDuration =
          await this.songRequestService.requestTotalDurationByChannelId(
            this.configService.get('CHZZK_CHANNEL_ID'),
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
        chatClient.sendChat(
          `@${chat.profile.nickname} 대기열 ${count}개, 총 길이: ${totalLengthMessage}`,
        );
      },
      cs: async (chat: ChatEvent) => {
        // 재생중인 곡 정보를 전송한다.
        const currentSong = await this.songRequestService.getCurrentSong(
          this.configService.get('CHZZK_CHANNEL_ID'),
        );
        if (currentSong) {
          chatClient.sendChat(
            `@${chat.profile.nickname}: 현재 곡: ${currentSong.title}`,
          );
        } else {
          chatClient.sendChat(
            `@${chat.profile.nickname}: 재생 중인 곡이 없습니다.`,
          );
        }
      },
      skip: async (chat: ChatEvent) => {
        // 위젯에 재생중인 영상을 스킵하고 다음 영상을 재생하게 한다.
        const currentSong = await this.songRequestService.getCurrentSong(
          this.configService.get('CHZZK_CHANNEL_ID'),
        );
        if (currentSong) {
          if (currentSong.requested_by !== chat.profile.userIdHash) {
            chatClient.sendChat(
              `@${chat.profile.nickname}: 등록한 곡이 아닙니다.`,
            );
            return;
          }
          await this.songRequestService.skipSong(currentSong);
          chatClient.sendChat(
            `@${chat.profile.nickname}: 재생 중인 ${currentSong.title} 영상을 스킵합니다.`,
          );
        } else {
          chatClient.sendChat(
            `@${chat.profile.nickname}: 재생중인 곡이 없습니다.`,
          );
        }
      },
      명령어: () => {
        chatClient.sendChat('명령어: !sr <url>, !sl, !우롱송, !명령어');
      },
      우롱송: async (chat: ChatEvent) => {
        this.logger.debug('remove last requested song');
        // 유저가 마지막으로 등록한 곡을 대기열에서 삭제한다. 재생중인 경우는 제외한다.
        const item = await this.songRequestService.lastRequestByUser(
          this.configService.get('CHZZK_CHANNEL_ID'),
          chat.profile.userIdHash,
        );
        if (item) {
          await this.songRequestService
            .deleteRequest({
              id: item.id,
            })
            .then(() => {
              chatClient.sendChat(
                `@${chat.profile.nickname}: 신청하신 ${item.title} 곡이 삭제되었습니다.`,
              );
            })
            .catch((reason) => {
              this.logger.warn('큐 삭제 실패', reason);
            });
        } else {
          chatClient.sendChat(
            `@${chat.profile.nickname}: 신청하신 곡이 없습니다.`,
          );
        }
      },
    });
  }

  private initChatEvent(channelId: string) {
    if (!this.chatClients[channelId]) {
      return;
    }
    const chatClient = this.chatClients[channelId];
    chatClient.on('connect', (chatChannelId) => {
      this.logger.debug(`Connected to ${chatChannelId}`);

      // 최근 50개의 채팅을 요청 (선택사항, 이 요청으로 불러와진 채팅 및 도네이션은 isRecent 값이 true)
      // chatClient.requestRecentChat(50)

      // 채팅 전송 (로그인 시에만 가능)
      chatClient.sendChat('구우봇이 연결되었습니다.');
    });

    // 재연결 (방송 시작 시)
    chatClient.on('reconnect', (chatChannelId) => {
      this.logger.debug(`Reconnected to ${chatChannelId}`);
    });

    // 일반 채팅
    chatClient.on('chat', async (chat) => {
      this.logger.debug(`chat time: ${chat.time}`);
      const message = chat.hidden ? '[블라인드 처리 됨]' : chat.message;
      this.logger.debug(`${chat.profile.nickname}: ${message}`);

      if (chat.message.startsWith('!')) {
        // 느낌표 떼고 커맨드 체크
        const commandLine = chat.message.trim().replace(/^!/, '').split(' ');
        this.logger.debug(`command: ${commandLine[0]} args: ${commandLine[1]}`);
        if (this.commands[commandLine[0]]) {
          await this.commands[commandLine[0]](chat, commandLine[1] ?? null);
        }
      }
      return Promise.resolve();
    });
  }
}
