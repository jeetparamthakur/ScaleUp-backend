import type { FormTableColumnDefinition } from '../../forms/types/form-schema.types';
import type { ProspectFieldDefinition } from '../../prospects/types/prospect-field-schema';
import {
  buildWhatsappMembersFromProspectIds,
  mapProspectToWhatsappListMember,
  resolveProspectPhoneRaw,
} from './map-prospect-to-whatsapp-list-member.util';

const tableColumns: FormTableColumnDefinition[] = [
  {
    id: '1',
    key: 'phone',
    label: 'Phone',
    type: 'phone',
    sortOrder: 0,
  },
  {
    id: '2',
    key: 'first_name',
    label: 'First Name',
    type: 'text',
    sortOrder: 1,
  },
  {
    id: '3',
    key: 'last_name',
    label: 'Last Name',
    type: 'text',
    sortOrder: 2,
  },
  {
    id: '4',
    key: 'company',
    label: 'Company',
    type: 'text',
    sortOrder: 3,
  },
];

const prospectFields: ProspectFieldDefinition[] = [
  {
    id: 'p1',
    key: 'phoneNumber',
    label: 'Phone',
    type: 'phone',
    sortOrder: 0,
    showInTable: true,
    showInForm: true,
  },
  {
    id: 'p2',
    key: 'company',
    label: 'Company',
    type: 'text',
    sortOrder: 1,
    showInTable: true,
    showInForm: true,
  },
];

describe('map-prospect-to-whatsapp-list-member.util', () => {
  it('resolves phone from prospect phone fields', () => {
    expect(
      resolveProspectPhoneRaw(
        { fullName: 'Ada', values: { phoneNumber: '+1 555 010 9999' } },
        prospectFields,
      ),
    ).toBe('+1 555 010 9999');
  });

  it('maps prospect to list member with normalized phone and name split', () => {
    const member = mapProspectToWhatsappListMember(
      {
        fullName: 'Ada Lovelace',
        values: { phoneNumber: '5550109999', company: 'Analytical Engines' },
      },
      tableColumns,
      prospectFields,
    );

    expect(member).toEqual({
      phone: '5550109999',
      firstName: 'Ada',
      lastName: 'Lovelace',
      company: 'Analytical Engines',
      customFields: {},
    });
  });

  it('returns null when phone is missing or invalid', () => {
    expect(
      mapProspectToWhatsappListMember(
        { fullName: 'No Phone', values: {} },
        tableColumns,
        prospectFields,
      ),
    ).toBeNull();
  });

  it('builds members and counts skipped ids, phones, and duplicates', () => {
    const prospectsById = new Map([
      [
        'a',
        {
          fullName: 'One',
          values: { phoneNumber: '+15550100001' },
        },
      ],
      [
        'b',
        {
          fullName: 'Two',
          values: { phoneNumber: '+15550100002' },
        },
      ],
      [
        'c',
        {
          fullName: 'No Phone',
          values: {},
        },
      ],
    ]);

    const { members, skippedCount } = buildWhatsappMembersFromProspectIds(
      ['a', 'b', 'c', 'missing', 'a', 'b'],
      prospectsById,
      tableColumns,
      prospectFields,
    );

    expect(members).toHaveLength(2);
    expect(skippedCount).toBe(4);
  });
});
