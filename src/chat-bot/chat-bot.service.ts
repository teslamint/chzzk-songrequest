import { Injectable } from '@nestjs/common';

@Injectable()
export class ChatBotService {
  private readonly commands = [];
  private readonly aliases = [];

  constructor() {
    this.registerCommands();
  }

  private registerCommands() {
    //
  }
}
