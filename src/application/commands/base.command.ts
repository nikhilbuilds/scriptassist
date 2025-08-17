export abstract class BaseCommand {
  public readonly commandId: string;
  public readonly timestamp: Date;

  constructor() {
    this.commandId = this.generateCommandId();
    this.timestamp = new Date();
  }

  private generateCommandId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  abstract getCommandType(): string;
}
