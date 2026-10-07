"use client";

import { ArrowDown, ArrowUp, FileText, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { DataNotice } from "@/components/app/data-notice";
import { Modal } from "@/components/app/modal";
import { prepareUpload, registerUpload } from "@/lib/actions/uploads";
import { UPLOAD_LIMITS, type UploadType } from "@/lib/uploads";

// Some browsers leave File.type empty for HEIC photos from iPhones.
const byExtension: Record<string, UploadType> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
};
const typeOf = (f: File) =>
  (UPLOAD_LIMITS.types as readonly string[]).includes(f.type) ? (f.type as UploadType) : byExtension[f.name.split(".").pop()?.toLowerCase() ?? ""];

type Picked = { key: string; file: File; type: UploadType; preview: string | null };

/**
 * Screenshots, photos, and PDFs sent in as one message. Several screenshots of
 * one conversation go together, in conversation order; the person can reorder.
 * Bytes go straight to storage through signed URLs, then the batch is registered.
 */
export function UploadDialog({ onClose, onSubmitted }: { onClose: () => void; onSubmitted: (id: string, duplicate: boolean) => void }) {
  const t = useTranslations("inbox");
  const [picked, setPicked] = useState<Picked[]>([]);
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const totalMb = picked.reduce((n, p) => n + p.file.size, 0) / 1024 / 1024;
  const limits = { files: UPLOAD_LIMITS.files, megabytes: UPLOAD_LIMITS.totalBytes / 1024 / 1024 };

  useEffect(() => () => picked.forEach((p) => p.preview && URL.revokeObjectURL(p.preview)), [picked]);

  const add = (files: FileList | File[]) => {
    setError(null);
    const next = [...files].map((file) => {
      const type = typeOf(file);
      return { key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`, file, type, preview: type?.startsWith("image/") && type !== "image/heic" && type !== "image/heif" ? URL.createObjectURL(file) : null };
    });
    if (next.some((p) => !p.type)) setError(t("uploadUnsupported"));
    setPicked((current) => [...current, ...next.filter((p) => p.type)].slice(0, UPLOAD_LIMITS.files));
  };
  const move = (i: number, by: number) =>
    setPicked((current) => {
      const copy = [...current];
      const [item] = copy.splice(i, 1);
      copy.splice(i + by, 0, item);
      return copy;
    });

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const meta = picked.map((p) => ({ name: p.file.name, type: p.type, size: p.file.size }));
      const prepared = await prepareUpload(meta);
      if ("error" in prepared) return setError(prepared.error);
      const sent = await Promise.all(
        picked.map((p, i) => fetch(prepared.uploads[i].url, { method: "PUT", headers: { "content-type": p.type }, body: p.file }).then((r) => r.ok).catch(() => false)),
      );
      if (sent.some((ok) => !ok)) return setError(t("uploadFailed"));
      const result = await registerUpload(meta.map((m, i) => ({ ...m, id: prepared.uploads[i].id })));
      if ("error" in result) return setError(result.error);
      onSubmitted(result.id, result.duplicate);
    });

  return (
    <Modal title={t("uploadTitle")} onClose={() => !pending && onClose()}>
      <div className="editor-form">
        <label
          className={`upload-drop ${dragging ? "dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            add(e.dataTransfer.files);
          }}
        >
          <span>{t("uploadDrop")}</span>
          <strong>{t("uploadPick")}</strong>
          <input
            type="file"
            aria-label={t("uploadPick")}
            multiple
            accept={[...UPLOAD_LIMITS.types, ".heic", ".heif"].join(",")}
            disabled={pending}
            onChange={(e) => {
              if (e.target.files) add(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <p className="muted">{t("uploadHint", limits)}</p>
        {picked.length > 0 && (
          <ol className="upload-list" aria-label={t("uploadOrder")}>
            {picked.map((p, i) => (
              <li key={p.key}>
                {/* eslint-disable-next-line @next/next/no-img-element -- a local preview (blob: URL) of a file not yet uploaded; next/image can't optimize it */}
                {p.preview ? <img src={p.preview} alt="" /> : <FileText size={28} aria-hidden="true" />}
                <span>
                  <strong>
                    {i + 1}. {p.file.name}
                  </strong>
                  <small>{t("fileSize", { megabytes: (p.file.size / 1024 / 1024).toFixed(1) })}</small>
                </span>
                <button type="button" className="icon-button" aria-label={t("moveUp", { name: p.file.name })} disabled={pending || i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp size={16} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t("moveDown", { name: p.file.name })}
                  disabled={pending || i === picked.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t("removeFile", { name: p.file.name })}
                  disabled={pending}
                  onClick={() => setPicked((current) => current.filter((x) => x.key !== p.key))}
                >
                  <X size={16} />
                </button>
              </li>
            ))}
          </ol>
        )}
        {picked.length > 0 && <p className="muted">{t("uploadTotal", { count: picked.length, megabytes: totalMb.toFixed(1) })}</p>}
        <p className="muted">{t("pasteHint")}</p>
        <DataNotice />
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-actions">
          <button type="button" className="secondary" disabled={pending} onClick={onClose}>
            {t("dismiss")}
          </button>
          <button type="button" className="primary" disabled={pending || !picked.length} onClick={submit}>
            {pending ? t("uploading") : t("analyze")}
          </button>
        </footer>
      </div>
    </Modal>
  );
}
