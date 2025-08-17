export abstract class BaseQuery {
  public readonly queryId: string;
  public readonly timestamp: Date;

  constructor() {
    this.queryId = this.generateQueryId();
    this.timestamp = new Date();
  }

  private generateQueryId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  abstract getQueryType(): string;
}
