import { ValidationError } from 'class-validator';
import { FieldError } from '../http/api-response';

/** Flattens class-validator errors (including nested objects) into `{ field, messages }`. */
export function flattenValidationErrors(errors: ValidationError[], parentPath = ''): FieldError[] {
  return errors.flatMap((error) => {
    const field = parentPath ? `${parentPath}.${error.property}` : error.property;
    const own: FieldError[] = error.constraints ? [{ field, messages: Object.values(error.constraints) }] : [];
    return [...own, ...flattenValidationErrors(error.children ?? [], field)];
  });
}
