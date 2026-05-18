import { v4 } from '../../lib/uuid';
import type { ParseResult } from '../types';

// Pre-rendered plot images / slides / PDFs that students share alongside
// the raw data. We don't try to render them on the map — we attach them
// so they show up in the sidebar's "Documents" group and can be opened
// from the detail panel.
export async function parseAttachment(file: File): Promise<ParseResult> {
  const url = URL.createObjectURL(file);
  return {
    datasets: [
      {
        id: v4(),
        name: file.name,
        source: { filename: file.name },
        kind: 'attachment',
        variables: [],
        records: [],
        style: { color: '#94a3b8', visible: false, opacity: 1 },
        meta: {
          instrument: 'Document',
          attachmentUrl: url,
          attachmentType: file.type || guessMime(file.name),
          attachmentSize: file.size,
        },
      },
    ],
    warnings: [],
  };
}

function guessMime(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  switch (ext) {
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'pdf': return 'application/pdf';
    case 'pptx': return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'ppt': return 'application/vnd.ms-powerpoint';
    default: return 'application/octet-stream';
  }
}
