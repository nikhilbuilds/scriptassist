import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'isNotPastDate', async: false })
export class IsNotPastDateConstraint implements ValidatorConstraintInterface {
  validate(dateValue: any, args: ValidationArguments) {
    // Allow undefined/null for optional fields
    if (!dateValue) {
      return true;
    }

    const date = new Date(dateValue);

    if (isNaN(date.getTime())) {
      return false;
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const inputDate = new Date(date);
    inputDate.setHours(0, 0, 0, 0);

    return inputDate >= now;
  }

  defaultMessage(args: ValidationArguments) {
    return 'Due date cannot be in the past';
  }
}

@ValidatorConstraint({ name: 'isReasonableFutureDate', async: false })
export class IsReasonableFutureDateConstraint implements ValidatorConstraintInterface {
  validate(dateValue: any, args: ValidationArguments) {
    if (!dateValue) {
      return true;
    }

    const date = new Date(dateValue);

    if (isNaN(date.getTime())) {
      return false;
    }

    const maxYearsInFuture = 10;
    const maxDate = new Date();
    maxDate.setFullYear(maxDate.getFullYear() + maxYearsInFuture);

    return date <= maxDate;
  }

  defaultMessage(args: ValidationArguments) {
    return 'Due date cannot be more than 10 years in the future';
  }
}

export function IsNotPastDate(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsNotPastDateConstraint,
    });
  };
}

export function IsReasonableFutureDate(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsReasonableFutureDateConstraint,
    });
  };
}
