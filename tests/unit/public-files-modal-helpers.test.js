import { describe, expect, it } from 'vitest';
import {
  canDeleteFiles,
  filterFilesByQuery,
  getFileStatus,
  renderFilesEmptyStateMarkup,
  renderFilesListMarkup,
} from '../../public/js/components/files-modal-helpers.js';

describe('files modal helpers', () => {
  it('derives file status and delete permission', () => {
    expect(getFileStatus({ extraction_status: 1 })).toBe('ready');
    expect(getFileStatus({ extraction_status: -1 })).toBe('failed');
    expect(canDeleteFiles({ permissions: ['file.delete'] })).toBe(true);
  });

  it('filters files by filename or type', () => {
    const files = [
      { id: '1', filename: 'notes.txt', content_type: 'text/plain' },
      { id: '2', filename: 'image.png', content_type: 'image/png' },
    ];
    expect(filterFilesByQuery(files, 'png')).toEqual([files[1]]);
  });

  it('renders file list and empty state markup', () => {
    expect(renderFilesEmptyStateMarkup()).toContain('No files yet');
    const html = renderFilesListMarkup([
      { id: 'f1', filename: '<report>.pdf', file_size: 1024, created_at: '2025-03-20', extraction_status: 1 },
    ], { permissions: [] , files: { selectedIds: ['f1'] } });
    expect(html).toContain('&lt;report&gt;.pdf');
    expect(html).toContain('data-file-id="f1"');
  });
});
