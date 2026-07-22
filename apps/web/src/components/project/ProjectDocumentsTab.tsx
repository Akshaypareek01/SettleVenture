import { useEffect } from 'react';
import { DocumentFile } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import ListToolbar from '../ui/ListToolbar';
import PaginationBar from '../ui/PaginationBar';
import AttachmentPreview from '../ui/AttachmentPreview';

interface ProjectDocumentsTabProps {
  ventureId: string;
  refreshKey?: number;
}

/**
 * Paginated documents list for a project with image/PDF preview.
 */
export default function ProjectDocumentsTab({ ventureId, refreshKey = 0 }: ProjectDocumentsTabProps) {
  const list = usePaginatedList<DocumentFile>(`/files/venture/${ventureId}`, {
    enabled: !!ventureId,
  });

  useEffect(() => {
    list.refresh();
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <ListToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search file name..."
      />

      {list.error && <p className="text-red-400 text-sm mb-3">{list.error}</p>}

      {list.loading ? (
        <div className="card text-center py-8 text-muted animate-pulse">Loading documents...</div>
      ) : list.items.length === 0 ? (
        <div className="card text-center py-8 text-muted">No documents uploaded yet.</div>
      ) : (
        <div className="space-y-4">
          {list.items.map((doc) => (
            <div key={doc.id} className="card flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{doc.fileName}</p>
                <p className="text-xs text-muted mt-1">
                  {doc.uploadedBy?.name} · {formatDate(doc.uploadedAt)}
                </p>
              </div>
              <AttachmentPreview
                attachments={[
                  {
                    id: doc.id,
                    fileName: doc.fileName,
                    fileType: doc.fileType,
                    downloadUrl: doc.downloadUrl,
                  },
                ]}
              />
            </div>
          ))}
        </div>
      )}

      <PaginationBar
        pagination={list.pagination}
        page={list.page}
        limit={list.limit}
        onPageChange={list.setPage}
        onLimitChange={list.setLimit}
        loading={list.loading}
      />
    </div>
  );
}
