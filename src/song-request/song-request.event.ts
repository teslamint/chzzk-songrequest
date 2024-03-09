import { SongRequest } from '@prisma/client';

export class SongRequestCreatedEvent {
  private readonly _data: SongRequest;

  constructor(data: SongRequest) {
    this._data = data;
  }

  data() {
    return this._data;
  }
}

export class SongRequestDeletedEvent {
  private readonly _data: SongRequest;

  constructor(data: SongRequest) {
    this._data = data;
  }

  data() {
    return this._data;
  }
}

export class SongRequestSkippedEvent {
  private readonly _data: SongRequest;

  constructor(data: SongRequest) {
    this._data = data;
  }

  data() {
    return this._data;
  }
}

export class SongRequestClearedEvent {
  private readonly _data: { channel_id: string };

  constructor(channelId: string) {
    this._data = { channel_id: channelId };
  }

  data() {
    return this._data;
  }
}
