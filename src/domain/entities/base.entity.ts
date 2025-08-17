import { PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Domain methods
  abstract validate(): boolean;
  abstract toDTO(): any;

  // Utility methods
  isNew(): boolean {
    return !this.id;
  }

  equals(other: BaseEntity): boolean {
    if (!other) return false;
    return this.id === other.id;
  }

  clone(): this {
    return Object.assign(Object.create(Object.getPrototypeOf(this)), this);
  }
}
