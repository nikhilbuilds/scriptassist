export abstract class DomainEvent {
  public readonly occurredOn: Date;
  public readonly eventId: string;
  public readonly aggregateId: string;
  public readonly eventType: string;

  constructor(aggregateId: string) {
    this.occurredOn = new Date();
    this.eventId = this.generateEventId();
    this.aggregateId = aggregateId;
    this.eventType = this.constructor.name;
  }

  private generateEventId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  abstract getEventData(): any;
}
