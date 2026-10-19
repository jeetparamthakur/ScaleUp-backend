import { BadRequestException } from '@nestjs/common';
import { FileParserService } from './file-parser.service';

describe('FileParserService', () => {
  const service = new FileParserService();

  function makeFile(
    originalname: string,
    content: string | Buffer,
  ): Express.Multer.File {
    const buffer = Buffer.isBuffer(content)
      ? content
      : Buffer.from(content, 'utf8');

    return {
      fieldname: 'file',
      originalname,
      encoding: '7bit',
      mimetype: 'application/octet-stream',
      size: buffer.length,
      buffer,
      destination: '',
      filename: originalname,
      path: '',
      stream: null as never,
    };
  }

  it('parses JSON array files', async () => {
    const file = makeFile(
      'contacts.json',
      JSON.stringify([
        { email: 'a@example.com', firstName: 'Ada', lastName: 'Lovelace' },
        { email: 'b@example.com', firstName: 'Grace', lastName: 'Hopper' },
      ]),
    );

    const parsed = await service.parseFile(file);

    expect(parsed.columns).toEqual(['email', 'firstName', 'lastName']);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]?.email).toBe('a@example.com');
  });

  it('parses JSON wrapper files', async () => {
    const file = makeFile(
      'contacts.json',
      JSON.stringify({
        contacts: [{ email: 'wrap@example.com', name: 'Wrapped User' }],
      }),
    );

    const parsed = await service.parseFile(file);

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.email).toBe('wrap@example.com');
  });

  it('parses plain-text email-per-line files', async () => {
    const file = makeFile(
      'emails.txt',
      'Jane Doe <jane@example.com>\njohn@example.com',
    );

    const parsed = await service.parseFile(file);

    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]?.Email).toBe('jane@example.com');
    expect(parsed.rows[0]?.Name).toBe('Jane Doe');
    expect(parsed.rows[1]?.Email).toBe('john@example.com');
  });

  it('parses plain-text phone-per-line files for WhatsApp imports', async () => {
    const file = makeFile(
      'phones.txt',
      'Jane Doe +91 9876543210\n+1 (415) 555-0100',
    );

    const parsed = await service.parseFile(file, { plainTextValue: 'phone' });

    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]?.Phone).toBe('+919876543210');
    expect(parsed.rows[0]?.Name).toBe('Jane Doe');
    expect(parsed.rows[1]?.Phone).toBe('+14155550100');
  });

  it('parses delimiter-separated text files with headers', async () => {
    const file = makeFile(
      'contacts.txt',
      'email,name\nalpha@example.com,Alpha User\nbeta@example.com,Beta User',
    );

    const parsed = await service.parseFile(file);

    expect(parsed.columns).toEqual(['email', 'name']);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]?.email).toBe('alpha@example.com');
  });

  it('suggests mapping for known headers', () => {
    const mapping = service.suggestMapping([
      'Email Address',
      'First Name',
      'Company',
    ]);

    expect(mapping.email).toBe('Email Address');
    expect(mapping.firstName).toBe('First Name');
    expect(mapping.company).toBe('Company');
  });

  it('rejects unsupported extensions', () => {
    const file = makeFile('contacts.doc', 'hello');

    expect(() => service.assertSupportedFile(file)).toThrow(
      BadRequestException,
    );
  });
});
