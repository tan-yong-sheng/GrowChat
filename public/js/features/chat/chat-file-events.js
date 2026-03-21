export function bindChatFileEvents({
  state,
  uploadFile,
  showToast,
  showToastProgress,
  getDraftAttachments,
  setDraftAttachments,
  getAllowedAttachmentKinds,
  getAllowedNonLocalKinds,
  getFileContentType,
  isAttachmentAllowedByModel,
  isSupportedAttachmentType,
} = {}) {
  const handleFilesSelected = async (event) => {
    const files = Array.isArray(event?.detail?.files) ? event.detail.files : [];
    if (!files.length) return;
    const toast = showToastProgress(`Uploading ${files.length} file${files.length > 1 ? 's' : ''}...`);
    try {
      const allowedKinds = getAllowedAttachmentKinds(state, { localTextLabel: 'text (local)' });
      const allowedNonLocalKinds = getAllowedNonLocalKinds(state);
      const chatId = state.activeChatId;
      const uploaded = [];
      let skippedUnsupported = 0;
      let skippedByModel = 0;
      for (const file of files) {
        const mediaType = getFileContentType(file);
        if (!isSupportedAttachmentType(mediaType)) {
          skippedUnsupported += 1;
          continue;
        }
        if (!isAttachmentAllowedByModel(state, mediaType)) {
          skippedByModel += 1;
          continue;
        }
        try {
          const data = await uploadFile(file, chatId, { timeoutMs: 30000 });
          uploaded.push({
            id: data.id,
            filename: data.filename,
            content_type: data.content_type,
            file_size: data.file_size,
          });
        } catch (err) {
          const message = String(err?.message || '');
          if (message.toLowerCase().includes('timeout')) {
            showToast(`Upload timed out for ${file?.name || 'file'}`);
          } else if (message) {
            showToast(`Failed to upload ${file?.name || 'file'}: ${message}`);
          } else {
            showToast(`Failed to upload ${file?.name || 'file'}`);
          }
        }
      }
      if (skippedUnsupported > 0) {
        showToast('Some files were skipped (unsupported type).');
      }
      if (skippedByModel > 0) {
        if (allowedNonLocalKinds.length > 0) {
          showToast(`Current model supports ${allowedNonLocalKinds.join(', ')} attachments.`);
        } else if (allowedKinds.includes('text (local)')) {
          showToast('Only text attachments are supported for this model.');
        } else {
          showToast('Attachments are disabled for this model.');
        }
      }
      if (uploaded.length) {
        const current = getDraftAttachments(chatId);
        const seen = new Set(current.map((item) => String(item?.id || '')));
        const next = [...current];
        uploaded.forEach((item) => {
          const key = String(item?.id || '');
          if (!key || seen.has(key)) return;
          seen.add(key);
          next.push(item);
        });
        setDraftAttachments(chatId, next);
      }
    } finally {
      toast.close?.();
    }
  };

  const handleAttachFiles = (event) => {
    const files = Array.isArray(event?.detail?.files) ? event.detail.files : [];
    if (!files.length) return;
    const allowedKinds = getAllowedAttachmentKinds(state, { localTextLabel: 'text (local)' });
    const allowedNonLocalKinds = getAllowedNonLocalKinds(state);
    const chatId = state.activeChatId;
    const filtered = files.filter((file) => {
      const mediaType = file?.content_type || file?.type || getFileContentType(file);
      return isSupportedAttachmentType(mediaType);
    });
    const modelFiltered = filtered.filter((file) => {
      const mediaType = file?.content_type || file?.type || getFileContentType(file);
      return isAttachmentAllowedByModel(state, mediaType);
    });
    if (filtered.length !== files.length) {
      showToast('Some files were skipped (unsupported type).');
    }
    if (modelFiltered.length !== filtered.length) {
      if (allowedNonLocalKinds.length > 0) {
        showToast(`Current model supports ${allowedNonLocalKinds.join(', ')} attachments.`);
      } else if (allowedKinds.includes('text (local)')) {
        showToast('Only text attachments are supported for this model.');
      } else {
        showToast('Attachments are disabled for this model.');
      }
    }
    const current = getDraftAttachments(chatId);
    const seen = new Set(current.map((item) => String(item?.id || '')));
    const next = [...current];
    modelFiltered.forEach((file) => {
      const key = String(file?.id || '');
      if (!key || seen.has(key)) return;
      seen.add(key);
      next.push({
        id: file.id,
        filename: file.filename,
        content_type: file.content_type,
        file_size: file.file_size,
      });
    });
    setDraftAttachments(chatId, next);
  };

  window.addEventListener('growchat:files-selected', handleFilesSelected);
  window.addEventListener('attach-files', handleAttachFiles);

  return () => {
    window.removeEventListener('growchat:files-selected', handleFilesSelected);
    window.removeEventListener('attach-files', handleAttachFiles);
  };
}

