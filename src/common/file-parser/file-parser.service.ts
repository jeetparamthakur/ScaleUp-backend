import { BadRequestException, Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';

export const FILE_PARSER_MAX_FILE_BYTES = 10 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  '.csv',
  '.xlsx',
  '.xls',
  '.json',
  '.txt',
  '.pdf',
]);

export const CRM_IMPORT_ALLOWED_EXTENSIONS = new Set([
  '.csv',
  '.xlsx',
  '.xls',
  '.json',
  '.txt',
]);

const EMAIL_REGEX = /[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+/g;

interface PdfParseResult {
  text?: string;
}

type PdfParseCtor = new (options: { data: Buffer }) => {
  getText(): Promise<PdfParseResult>;
  destroy?(): Promise<void>;
};

const JSON_ARRAY_KEYS = ['contacts', 'data', 'rows', 'items', 'records'];

export interface ParsedContactFile {
  columns: string[];
  rows: Record<string, string>[];
}

export interface SuggestedFieldMapping {
  email?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  phone?: string;
}

export interface ImportPreviewResult {
  columns: string[];
  sampleRows: Record<string, string>[];
  suggestedMapping: SuggestedFieldMapping;
  rowCount: number;
}

/** How to interpret plain `.txt` files without a delimiter header row. */
export type PlainTextImportValue = 'email' | 'phone';

export interface ImportParseOptions {
  plainTextValue?: PlainTextImportValue;
}

const MIN_IMPORT_PHONE_DIGITS = 8;
const MAX_IMPORT_PHONE_DIGITS = 15;

export interface CrmImportFieldRef {
  key: string;
  label: string;
  type: string;
  locationComponents?: string[];
}

const HEADER_ALIASES: Record<keyof SuggestedFieldMapping, string[]> = {
  email: ['email', 'e-mail', 'email address', 'emailaddress', 'mail'],
  firstName: [
    'first name',
    'firstname',
    'first',
    'given name',
    'givenname',
    'fname',
    'name',
    'full name',
    'fullname',
  ],
  lastName: [
    'last name',
    'lastname',
    'last',
    'surname',
    'family name',
    'lname',
  ],
  company: ['company', 'organization', 'organisation', 'org', 'employer'],
  phone: [
    'phone',
    'phone number',
    'phonenumber',
    'mobile',
    'cell',
    'telephone',
    'tel',
  ],
};

const CRM_FIELD_ALIASES: Record<string, string[]> = {
  fullName: ['name', 'full name', 'fullname', 'contact name'],
  email: ['email', 'e mail', 'email address', 'mail'],
  brokerName: ['broker name', 'broker', 'company', 'organization', 'org'],
};

/** @deprecated Use FILE_PARSER_MAX_FILE_BYTES */
export const CONTACT_LIST_MAX_FILE_BYTES = FILE_PARSER_MAX_FILE_BYTES;

@Injectable()
export class FileParserService {
  assertSupportedFile(
    file: Express.Multer.File | undefined,
  ): Express.Multer.File {
    return this.assertSupportedFileWithExtensions(file, ALLOWED_EXTENSIONS, [
      'CSV',
      'Excel',
      'JSON',
      'TXT',
      'PDF',
    ]);
  }

  assertSupportedCrmImportFile(
    file: Express.Multer.File | undefined,
  ): Express.Multer.File {
    return this.assertSupportedFileWithExtensions(
      file,
      CRM_IMPORT_ALLOWED_EXTENSIONS,
      ['CSV', 'Excel', 'JSON', 'TXT'],
    );
  }

  async preview(
    file: Express.Multer.File,
    options?: ImportParseOptions,
  ): Promise<ImportPreviewResult> {
    const parsed = await this.parseFile(file, options);

    return {
      columns: parsed.columns,
      sampleRows: parsed.rows.slice(0, 5),
      suggestedMapping: this.suggestMapping(parsed.columns),
      rowCount: parsed.rows.length,
    };
  }

  async parseFile(
    file: Express.Multer.File,
    options?: ImportParseOptions,
  ): Promise<ParsedContactFile> {
    const extension = this.getExtension(file.originalname);

    switch (extension) {
      case '.csv':
        return this.parseCsv(file.buffer);
      case '.json':
        return this.parseJson(file.buffer);
      case '.txt':
        return this.parseTxt(file.buffer, options?.plainTextValue ?? 'email');
      case '.pdf':
        return this.parsePdf(file.buffer);
      default:
        return await this.parseExcel(file.buffer);
    }
  }

  suggestMapping(columns: string[]): SuggestedFieldMapping {
    const normalizedColumns = new Map(
      columns.map((column) => [this.normalizeHeader(column), column]),
    );

    const mapping: SuggestedFieldMapping = {};

    for (const [field, aliases] of Object.entries(HEADER_ALIASES) as Array<
      [keyof SuggestedFieldMapping, string[]]
    >) {
      for (const alias of aliases) {
        const match = normalizedColumns.get(alias);
        if (match) {
          mapping[field] = match;
          break;
        }
      }
    }

    return mapping;
  }

  suggestCrmFieldMapping(
    columns: string[],
    fields: CrmImportFieldRef[],
  ): Record<string, string> {
    const normalizedColumns = new Map(
      columns.map((column) => [this.normalizeHeader(column), column]),
    );
    const usedColumns = new Set<string>();
    const mapping: Record<string, string> = {};

    for (const field of fields) {
      const aliases = [
        this.normalizeHeader(field.label),
        this.normalizeHeader(field.key),
        ...(CRM_FIELD_ALIASES[field.key] ?? []),
      ];

      for (const alias of aliases) {
        const match = normalizedColumns.get(alias);
        if (match && !usedColumns.has(match)) {
          mapping[field.key] = match;
          usedColumns.add(match);
          break;
        }
      }
    }

    for (const field of fields) {
      if (field.type !== 'location' || !field.locationComponents?.length) {
        continue;
      }

      for (const component of field.locationComponents) {
        const mappingKey = `${field.key}.${component}`;
        if (mapping[mappingKey]) {
          continue;
        }

        const aliases = [
          this.normalizeHeader(`${field.label} ${component}`),
          this.normalizeHeader(component),
        ];

        for (const alias of aliases) {
          const match = normalizedColumns.get(alias);
          if (match && !usedColumns.has(match)) {
            mapping[mappingKey] = match;
            usedColumns.add(match);
            break;
          }
        }
      }
    }

    return mapping;
  }

  normalizeHeader(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, ' ');
  }

  private assertSupportedFileWithExtensions(
    file: Express.Multer.File | undefined,
    allowedExtensions: Set<string>,
    allowedLabels: string[],
  ): Express.Multer.File {
    if (!file) {
      throw new BadRequestException('A file upload is required');
    }

    if (file.size > FILE_PARSER_MAX_FILE_BYTES) {
      throw new BadRequestException('File exceeds the 10 MB size limit');
    }

    const extension = this.getExtension(file.originalname);
    if (!allowedExtensions.has(extension)) {
      throw new BadRequestException(
        `Unsupported file type. Upload ${allowedLabels.join(', ')} files only`,
      );
    }

    return file;
  }

  private parseCsv(buffer: Buffer): ParsedContactFile {
    let records: Record<string, unknown>[];

    try {
      records = parse(buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
      });
    } catch {
      throw new BadRequestException('Unable to parse CSV file');
    }

    return this.buildParsedFileFromRecords(records);
  }

  private async parseExcel(buffer: Buffer): Promise<ParsedContactFile> {
    const XLSX = await import('@e965/xlsx');
    let workbook: ReturnType<typeof XLSX.read>;

    try {
      workbook = XLSX.read(buffer, { type: 'buffer' });
    } catch {
      throw new BadRequestException('Unable to parse Excel file');
    }

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new BadRequestException('The Excel file has no sheets');
    }

    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: false,
    });

    return this.buildParsedFileFromRecords(rawRows);
  }

  private parseJson(buffer: Buffer): ParsedContactFile {
    let parsed: unknown;

    try {
      parsed = JSON.parse(buffer.toString('utf8')) as unknown;
    } catch {
      throw new BadRequestException('Unable to parse JSON file');
    }

    const records = this.extractJsonRecords(parsed);
    return this.buildParsedFileFromRecords(records);
  }

  private extractJsonRecords(parsed: unknown): Record<string, unknown>[] {
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' && item !== null && !Array.isArray(item),
      );
    }

    if (typeof parsed === 'object' && parsed !== null) {
      const wrapper = parsed as Record<string, unknown>;

      for (const key of JSON_ARRAY_KEYS) {
        const candidate = wrapper[key];
        if (Array.isArray(candidate)) {
          return candidate.filter(
            (item): item is Record<string, unknown> =>
              typeof item === 'object' && item !== null && !Array.isArray(item),
          );
        }
      }
    }

    throw new BadRequestException(
      'JSON file must contain an array of contact objects or a wrapper with contacts/data/rows',
    );
  }

  private normalizeImportPhone(raw: string): string | null {
    const trimmed = raw.trim();
    if (!trimmed) {
      return null;
    }

    const hasPlus = trimmed.startsWith('+');
    const digits = trimmed.replace(/\D/g, '');

    if (
      digits.length < MIN_IMPORT_PHONE_DIGITS ||
      digits.length > MAX_IMPORT_PHONE_DIGITS
    ) {
      return null;
    }

    return hasPlus ? `+${digits}` : digits;
  }

  private extractPhoneFromTextLine(line: string): string | null {
    const candidates = line.match(/\+?[\d][\d\s().-]{6,}[\d]/g) ?? [];
    let best: string | null = null;
    let bestDigitCount = 0;

    for (const candidate of candidates) {
      const normalized = this.normalizeImportPhone(candidate);
      if (!normalized) {
        continue;
      }

      const digitCount = normalized.replace(/\D/g, '').length;
      if (digitCount > bestDigitCount) {
        best = normalized;
        bestDigitCount = digitCount;
      }
    }

    if (best) {
      return best;
    }

    return this.normalizeImportPhone(line);
  }

  private parseTxt(
    buffer: Buffer,
    plainTextValue: PlainTextImportValue,
  ): ParsedContactFile {
    const content = buffer.toString('utf8');
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      throw new BadRequestException('The uploaded file has no data rows');
    }

    const delimiter = this.detectDelimiter(lines[0] ?? '');
    if (delimiter) {
      const headerParts = this.splitDelimitedLine(lines[0] ?? '', delimiter);
      const columns = headerParts.map(
        (part, index) => part.trim() || `Column ${index + 1}`,
      );
      const dataLines = lines.slice(1);

      if (dataLines.length === 0) {
        throw new BadRequestException('The uploaded file has no data rows');
      }

      const rows = dataLines.map((line) => {
        const parts = this.splitDelimitedLine(line, delimiter);
        const row: Record<string, string> = {};

        for (let index = 0; index < columns.length; index += 1) {
          row[columns[index] ?? `Column ${index + 1}`] = (
            parts[index] ?? ''
          ).trim();
        }

        return row;
      });

      return { columns, rows };
    }

    const rows: Record<string, string>[] = [];

    if (plainTextValue === 'phone') {
      for (const line of lines) {
        const phone = this.extractPhoneFromTextLine(line);
        if (!phone) {
          continue;
        }

        const phoneMatch = line.match(/\+?[\d][\d\s().-]{6,}[\d]/);
        const matchIndex = phoneMatch?.index ?? -1;
        const beforePhone =
          matchIndex > 0 ? line.slice(0, matchIndex).trim() : '';
        const name = beforePhone
          .replace(/[,;|:-]+$/g, '')
          .replace(/[<>]+$/g, '')
          .trim();

        rows.push({
          Phone: phone,
          ...(name ? { Name: name } : {}),
        });
      }

      if (rows.length === 0) {
        throw new BadRequestException(
          'No valid phone numbers found in the text file',
        );
      }
    } else {
      for (const line of lines) {
        const emailMatch = line.match(EMAIL_REGEX)?.[0];
        if (!emailMatch) {
          continue;
        }

        const email = emailMatch.trim();
        const beforeEmail = line.slice(0, line.indexOf(email)).trim();
        const name = beforeEmail
          .replace(/[,;|:-]+$/g, '')
          .replace(/[<>]+$/g, '')
          .trim();

        rows.push({
          Email: email,
          ...(name ? { Name: name } : {}),
        });
      }

      if (rows.length === 0) {
        throw new BadRequestException(
          'No valid email addresses found in the text file',
        );
      }
    }

    const columns = Array.from(
      new Set(rows.flatMap((row) => Object.keys(row))),
    );

    return { columns, rows };
  }

  private async parsePdf(buffer: Buffer): Promise<ParsedContactFile> {
    const text = await this.extractPdfText(buffer);
    return this.parsePdfText(text);
  }

  private async extractPdfText(buffer: Buffer): Promise<string> {
    const pdfParseModule = await import('pdf-parse');
    const moduleExport = pdfParseModule as unknown as {
      default?: { PDFParse?: PdfParseCtor };
      PDFParse?: PdfParseCtor;
    };
    const PDFParse = moduleExport.PDFParse ?? moduleExport.default?.PDFParse;

    if (!PDFParse) {
      throw new BadRequestException('Unable to parse PDF file');
    }

    const parser = new PDFParse({ data: buffer });

    try {
      const result = await parser.getText();
      return result.text ?? '';
    } catch {
      throw new BadRequestException('Unable to parse PDF file');
    } finally {
      await parser.destroy?.();
    }
  }

  private parsePdfText(text: string): ParsedContactFile {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const rows: Record<string, string>[] = [];

    for (const line of lines) {
      const matches = line.match(EMAIL_REGEX) ?? [];

      for (const email of matches) {
        const normalizedEmail = email.trim().toLowerCase();
        const beforeEmail = line.slice(0, line.indexOf(email)).trim();
        const name = beforeEmail.replace(/[,;|:-]+$/g, '').trim();

        rows.push({
          Email: normalizedEmail,
          ...(name ? { Name: name } : {}),
        });
      }
    }

    if (rows.length === 0) {
      throw new BadRequestException(
        'No valid email addresses found in the PDF file',
      );
    }

    const dedupedRows = this.deduplicateRowsByEmail(rows, 'Email');
    const columns = Array.from(
      new Set(dedupedRows.flatMap((row) => Object.keys(row))),
    );

    return { columns, rows: dedupedRows };
  }

  private deduplicateRowsByEmail(
    rows: Record<string, string>[],
    emailColumn: string,
  ): Record<string, string>[] {
    const seen = new Set<string>();
    const deduped: Record<string, string>[] = [];

    for (const row of rows) {
      const email = (row[emailColumn] ?? '').trim().toLowerCase();
      if (!email || seen.has(email)) {
        continue;
      }

      seen.add(email);
      deduped.push(row);
    }

    return deduped;
  }

  private detectDelimiter(line: string): '\t' | ',' | ';' | null {
    const tabCount = (line.match(/\t/g) ?? []).length;
    const commaCount = (line.match(/,/g) ?? []).length;
    const semicolonCount = (line.match(/;/g) ?? []).length;

    if (tabCount > 0 && tabCount >= commaCount && tabCount >= semicolonCount) {
      return '\t';
    }

    if (
      semicolonCount > 0 &&
      semicolonCount >= commaCount &&
      semicolonCount >= tabCount
    ) {
      return ';';
    }

    if (commaCount > 0) {
      return ',';
    }

    return null;
  }

  private splitDelimitedLine(line: string, delimiter: string): string[] {
    if (delimiter === ',') {
      return line.split(',').map((part) => part.trim());
    }

    return line.split(delimiter).map((part) => part.trim());
  }

  private buildParsedFileFromRecords(
    records: Record<string, unknown>[],
  ): ParsedContactFile {
    if (records.length === 0) {
      throw new BadRequestException('The uploaded file has no data rows');
    }

    const columns = Object.keys(records[0] ?? {}).filter(
      (column) => column.trim().length > 0,
    );

    if (columns.length === 0) {
      throw new BadRequestException('The uploaded file has no column headers');
    }

    const rows = records.map((record) => this.normalizeRow(record, columns));

    return { columns, rows };
  }

  private normalizeRow(
    record: Record<string, unknown>,
    columns: string[],
  ): Record<string, string> {
    const row: Record<string, string> = {};

    for (const column of columns) {
      const value = record[column];
      row[column] = this.toCellString(value);
    }

    return row;
  }

  private toCellString(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'string') {
      return value.trim();
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    return '';
  }

  private getExtension(filename: string): string {
    const dotIndex = filename.lastIndexOf('.');
    if (dotIndex === -1) {
      return '';
    }

    return filename.slice(dotIndex).toLowerCase();
  }
}
