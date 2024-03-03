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
