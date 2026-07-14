export function bindChatFileEvents({
  state,
  uploadFile,
  showToast,
  showToastProgress,
  getDraftAttachments,
  setDraftAttachments,
  getAllowedNonLocalKinds,
  getFileContentType,
  isAttachmentAllowedByModel,
  isSupportedAttachmentType,
} = {}) {
  const showUploadError = (err, file) => {
    const message = String(err?.message || '');
    const name = file?.name || 'file';
    if (message.toLowerCase().includes('timeout')) {
      showToast(`Upload timed out for ${name}`);
    } else if (message) {
      showToast(`Failed to upload ${name}: ${message}`);
    } else {
      showToast(`Failed to upload ${name}`);
    }
  };

  const processSelectedFile = async (file, chatId) => {
    const mediaType = getFileContentType(file);
    if (!isSupportedAttachmentType(mediaType)) return { skippedUnsupported: true };
    if (!isAttachmentAllowedByModel(state, mediaType)) return { skippedByModel: true };
    try {
      const data = await uploadFile(file, chatId, { timeoutMs: 30000 });
      return {
        uploaded: {
          id: data.id,
          filename: data.filename,
          content_type: data.content_type,
          file_size: data.file_size,
        },
      };
    } catch (err) {
      showUploadError(err, file);
      return { uploaded: null };
    }
  };

  const showUploadSkipMessages = (skippedUnsupported, skippedByModel, allowedNonLocalKinds) => {
    if (skippedUnsupported > 0) {
      showToast('Some files were skipped (unsupported type).');
    }
    if (skippedByModel > 0 && allowedNonLocalKinds.length > 0) {
      showToast(`Current model supports ${allowedNonLocalKinds.join(', ')} attachments.`);
    }
  };

  const mergeUploadedAttachments = (uploaded) => {
    const chatId = state.activeChatId;
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
  };

  function pluralizeFiles(count) {
    return `${count} file${count > 1 ? 's' : ''}`;
  }

  async function uploadSingleFile(file, chatId) {
    const outcome = await processSelectedFile(file, chatId);
    if (outcome.skippedUnsupported) return { kind: 'unsupported' };
    if (outcome.skippedByModel) return { kind: 'model' };
    if (outcome.uploaded) return { kind: 'uploaded', file: outcome.uploaded };
    return { kind: 'other' };
  }

  async function collectUploadedFiles(files, chatId) {
    const uploaded = [];
    let skippedUnsupported = 0;
    let skippedByModel = 0;
    for (const file of files) {
      const result = await uploadSingleFile(file, chatId);
      if (result.kind === 'unsupported') skippedUnsupported += 1;
      else if (result.kind === 'model') skippedByModel += 1;
      else if (result.kind === 'uploaded') uploaded.push(result.file);
    }
    return { uploaded, skippedUnsupported, skippedByModel };
  }

  const handleFilesSelected = async (event) => {
    const files = Array.isArray(event?.detail?.files) ? event.detail.files : [];
    if (!files.length) return;
    const toast = showToastProgress(`Uploading ${pluralizeFiles(files.length)}...`);
    try {
      const allowedNonLocalKinds = getAllowedNonLocalKinds(state);
      const chatId = state.activeChatId;
      const { uploaded, skippedUnsupported, skippedByModel } = await collectUploadedFiles(
        files,
        chatId
      );
      showUploadSkipMessages(skippedUnsupported, skippedByModel, allowedNonLocalKinds);
      if (uploaded.length) mergeUploadedAttachments(uploaded);
    } finally {
      toast.close?.();
    }
  };

  const resolveAttachmentMediaType = (file) =>
    file?.content_type || file?.type || getFileContentType(file);

  const isModelAttachmentAllowed = (file) =>
    isAttachmentAllowedByModel(state, resolveAttachmentMediaType(file));

  const showAttachSkipMessages = (filesCount, filteredCount, modelCount, allowedNonLocalKinds) => {
    if (filteredCount !== filesCount) {
      showToast('Some files were skipped (unsupported type).');
    }
    if (modelCount !== filteredCount && allowedNonLocalKinds.length > 0) {
      showToast(`Current model supports ${allowedNonLocalKinds.join(', ')} attachments.`);
    }
  };

  const mergeAttachFiles = (modelFiltered, chatId) => {
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

  const handleAttachFiles = (event) => {
    const files = Array.isArray(event?.detail?.files) ? event.detail.files : [];
    if (!files.length) return;
    const allowedNonLocalKinds = getAllowedNonLocalKinds(state);
    const chatId = state.activeChatId;
    const filtered = files.filter((file) =>
      isSupportedAttachmentType(resolveAttachmentMediaType(file))
    );
    const modelFiltered = filtered.filter(isModelAttachmentAllowed);
    showAttachSkipMessages(
      files.length,
      filtered.length,
      modelFiltered.length,
      allowedNonLocalKinds
    );
    mergeAttachFiles(modelFiltered, chatId);
  };

  window.addEventListener('growchat:files-selected', handleFilesSelected);
  window.addEventListener('attach-files', handleAttachFiles);

  return () => {
    window.removeEventListener('growchat:files-selected', handleFilesSelected);
    window.removeEventListener('attach-files', handleAttachFiles);
  };
}
