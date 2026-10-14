import {
  IsEmail,
  IsNotEmpty,
  IsObject,
  IsString,
  MinLength,
  ValidateBy,
} from 'class-validator';

/**
 * Department: single key = main department, value = subdepartment e.g. { operations: 'ramp' }
 */
const departmentValidator = (obj: unknown): boolean => {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj))
    return false;
  const keys = Object.keys(obj as Record<string, unknown>);
  if (keys.length !== 1) return false;
  const value = (obj as Record<string, unknown>)[keys[0]];
  return typeof value === 'string' && value.length > 0;
};

/**
 * Flags: each value is 0|1 or an object with string keys and values 0|1 (e.g. ramp: { "ramp details": 1, ... })
 */
function isFlagsValue(v: unknown): boolean {
  if (v === 0 || v === 1) return true;
  if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    return Object.values(o).every((x) => x === 0 || x === 1);
  }
  return false;
}

const flagsValidator = (obj: unknown): boolean => {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj))
    return false;
  return Object.values(obj as Record<string, unknown>).every(isFlagsValue);
};

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  userid: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  /** Department and subdepartment e.g. { operations: 'ramp' } */
  @IsObject()
  @ValidateBy({
    name: 'departmentFormat',
    validator: {
      validate: departmentValidator,
      defaultMessage: () =>
        'department must be a single key-value pair: department as key, subdepartment as string value (e.g. { "operations": "ramp" })',
    },
  })
  department: Record<string, string>;

  /** Module flags: named keys, values 0|1 or nested object (e.g. { "main details": 1, "ramp": { "ramp details": 1 } }) */
  @IsObject()
  @ValidateBy({
    name: 'flagsFormat',
    validator: {
      validate: flagsValidator,
      defaultMessage: () =>
        'flags values must be 0 or 1, or nested objects with 0|1 values',
    },
  })
  flags: Record<string, number | Record<string, number>>;
}
