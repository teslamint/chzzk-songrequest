import { SongRequest } from '@prisma/client';

/**
 * Event emitted when a new song request is created.
 */
export class SongRequestCreatedEvent {
  private readonly _data: SongRequest;

  /**
   * Creates a new SongRequestCreatedEvent.
   * @param data - The SongRequest data associated with the event.
   */
  constructor(data: SongRequest) {
    this._data = data;
  }

  /**
   * Returns the SongRequest data associated with this event.
   * @returns The SongRequest data.
   */
  data() {
    return this._data;
  }
}

/**
 * Event emitted when a song request is deleted.
 */
export class SongRequestDeletedEvent {
  private readonly _data: SongRequest;

  /**
   * Creates a new SongRequestDeletedEvent.
   * @param data - The SongRequest data associated with the event.
   */
  constructor(data: SongRequest) {
    this._data = data;
  }

  /**
   * Returns the SongRequest data associated with this event.
   * @returns The SongRequest data.
   */
  data() {
    return this._data;
  }
}

/**
 * Event emitted when a song request is skipped.
 */
export class SongRequestSkippedEvent {
  private readonly _data: SongRequest;

  /**
   * Creates a new SongRequestSkippedEvent.
   * @param data - The SongRequest data associated with the event.
   */
  constructor(data: SongRequest) {
    this._data = data;
  }

  /**
   * Returns the SongRequest data associated with this event.
   * @returns The SongRequest data.
   */
  data() {
    return this._data;
  }
}

/**
 * Event emitted when all pending song requests for a channel are cleared.
 */
export class SongRequestClearedEvent {
  private readonly _data: { channel_id: string };

  /**
   * Creates a new SongRequestClearedEvent.
   * @param channelId - The ID of the channel for which the queue was cleared.
   */
  constructor(channelId: string) {
    this._data = { channel_id: channelId };
  }

  /**
   * Returns the channel ID associated with this event.
   * @returns An object containing the channel ID.
   */
  data() {
    return this._data;
  }
}
