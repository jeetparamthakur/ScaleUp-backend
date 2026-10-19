import { BadRequestException } from '@nestjs/common';
import { FIELD_KEY_PATTERN } from './field-schema.validator';
import type { FormTableColumnDefinition } from '../types/form-schema.types';

const TABLE_COLUMN_TYPES = new Set([
  'text',
  'email',
  'phone',
  'number',
  'date',
]);

export function validateFormTableColumnSchema(
  columns: FormTableColumnDefinition[],
  options?: { requireEmailColumn?: boolean; requirePhoneColumn?: boolean },
): FormTableColumnDefinition[] {
  const keys = new Set<string>();
  const ids = new Set<string>();
  let emailColumnCount = 0;
  let phoneColumnCount = 0;

  const normalized = columns.map((column, index) => {
    const label = column.label.trim();
    const key = column.key.trim();

    if (!label) {
      throw new BadRequestException('Every table column must have a label');
    }

    if (!FIELD_KEY_PATTERN.test(key)) {
      throw new BadRequestException(
        `Table column key "${column.key}" must start with a lowercase letter and contain only letters, numbers, and underscores`,
      );
    }

    if (!TABLE_COLUMN_TYPES.has(column.type)) {
      throw new BadRequestException(
        `Invalid table column type "${column.type}"`,
      );
    }

    if (keys.has(key)) {
      throw new BadRequestException(`Duplicate table column key "${key}"`);
    }

    if (ids.has(column.id)) {
      throw new BadRequestException(`Duplicate table column id "${column.id}"`);
    }

    keys.add(key);
    ids.add(column.id);

    if (column.type === 'email') {
      emailColumnCount += 1;
    }

    if (column.type === 'phone') {
      phoneColumnCount += 1;
    }

    return {
      ...column,
      key,
      label,
      sortOrder: index,
      required: column.system ? true : column.required,
    };
  });

  if (options?.requireEmailColumn && emailColumnCount === 0) {
    throw new BadRequestException(
      'Contact list import columns must include an email column',
    );
  }

  if (options?.requireEmailColumn && emailColumnCount > 1) {
    throw new BadRequestException(
      'Contact list import columns may only include one email column',
    );
  }

  if (options?.requirePhoneColumn && phoneColumnCount === 0) {
    throw new BadRequestException(
      'WhatsApp list import columns must include a phone column',
    );
  }

  if (options?.requirePhoneColumn && phoneColumnCount > 1) {
    throw new BadRequestException(
      'WhatsApp list import columns may only include one phone column',
    );
  }

  return normalized;
}

export function assertRequiredTableColumnsMapped(
  columns: FormTableColumnDefinition[],
  mappings: Array<{ targetColumnKey: string; sourceColumn: string }>,
): void {
  const mappingByKey = new Map(
    mappings.map((mapping) => [mapping.targetColumnKey, mapping.sourceColumn]),
  );

  const missingRequired = columns
    .filter((column) => column.required)
    .filter((column) => !mappingByKey.get(column.key)?.trim())
    .map((column) => column.label);

  if (missingRequired.length > 0) {
    throw new BadRequestException(
      `Required columns must be mapped: ${missingRequired.join(', ')}`,
    );
  }
}
