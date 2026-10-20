import type { WhatsappContactListMemberEntity } from '../entities/whatsapp-contact-list-member.entity';
import type { WhatsappContactListEntity } from '../entities/whatsapp-contact-list.entity';
import type { WhatsappListFieldSchema } from '../types/whatsapp-list-field-schema';

function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-') || 'whatsapp-list'
  );
}

export function buildWhatsappListPdfFilename(listName: string): string {
  return `${sanitizeFilename(listName)}.pdf`;
}

function getMemberCellValue(
  member: WhatsappContactListMemberEntity,
  key: string,
): string {
  switch (key) {
    case 'firstName':
      return member.firstName ?? '';
    case 'lastName':
      return member.lastName ?? '';
    case 'company':
      return member.company ?? '';
    default:
      return member.customFields[key] ?? '';
  }
}

export async function renderWhatsappListPdf(
  list: WhatsappContactListEntity,
  fieldSchema: WhatsappListFieldSchema,
  members: WhatsappContactListMemberEntity[],
): Promise<Buffer> {
  const phoneLabel = fieldSchema.phone.label;
  const columns = [
    { key: fieldSchema.phone.key, label: phoneLabel },
    ...fieldSchema.fields.map((field) => ({
      key: field.key,
      label: field.label,
    })),
  ];

  const { default: PDFDocument } = await import('pdfkit');

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text(list.name, { continued: false });
    doc.moveDown(0.5);
    doc
      .fontSize(10)
      .fillColor('#444444')
      .text(
        `Visibility: ${list.visibility === 'org' ? 'Organization' : 'Private'} · Contacts: ${list.contactCount.toLocaleString()} · Exported: ${new Date().toLocaleString()}`,
      );
    doc.moveDown(1.5);
    doc.fillColor('#000000');

    const pageWidth =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const columnWidth = pageWidth / columns.length;
    const rowHeight = 22;
    let y = doc.y;

    function drawRow(values: string[], isHeader: boolean) {
      if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = doc.page.margins.top;
      }

      let x = doc.page.margins.left;
      doc
        .font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(isHeader ? 9 : 8);

      for (const value of values) {
        doc.text(value.slice(0, 80), x, y, {
          width: columnWidth - 4,
          height: rowHeight,
          ellipsis: true,
        });
        x += columnWidth;
      }

      y += rowHeight;
    }

    drawRow(
      columns.map((column) => column.label),
      true,
    );

    for (const member of members) {
      const row = columns.map((column) => {
        if (column.key === fieldSchema.phone.key) {
          return member.phone;
        }

        return getMemberCellValue(member, column.key);
      });
      drawRow(row, false);
    }

    doc.end();
  });
}
