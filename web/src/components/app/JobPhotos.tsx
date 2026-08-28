import { useState } from 'react';
import { FileButton } from '../ui/Button';
import { Notice } from '../ui/States';
import { formatBytes } from '../../lib/images';
import { MAX_JOB_PHOTOS, draftFromFile, releaseDraft, type PhotoDraft } from '../../lib/photos';

/**
 * The photo section of a quote — what the job looked like when it was priced.
 *
 * Photos are prepared (rotated, resized, re-encoded) the moment they are
 * picked, so the thumbnail on screen is the exact blob that will be uploaded.
 * A raw iPhone photo is 5–12MB; by the time it reaches this grid it is a few
 * hundred KB, which is what makes uploading a dozen of them from a driveway
 * realistic.
 */
export function JobPhotos({
  drafts,
  onDraftsChange,
  existing = [],
  onRemoveExisting,
  disabled = false,
}: {
  drafts: PhotoDraft[];
  onDraftsChange: (drafts: PhotoDraft[]) => void;
  /** Download URLs of photos already on the job. */
  existing?: string[];
  onRemoveExisting?: (url: string) => void;
  disabled?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const total = existing.length + drafts.length;
  const room = MAX_JOB_PHOTOS - total;

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    setError(null);
    setWorking(true);

    const accepted: PhotoDraft[] = [];
    const failures: string[] = [];

    // One at a time: prepareImage decodes a full-size photo into a canvas, and
    // doing eight of those at once is what makes a phone browser drop the tab.
    for (const file of Array.from(files).slice(0, Math.max(0, room))) {
      try {
        accepted.push(await draftFromFile(file));
      } catch (cause) {
        failures.push(cause instanceof Error ? cause.message : `Could not read "${file.name}".`);
      }
    }

    if (files.length > room) {
      failures.push(`Only ${MAX_JOB_PHOTOS} photos per job — the rest were skipped.`);
    }

    setWorking(false);
    if (failures.length > 0) setError(failures.join(' '));
    if (accepted.length > 0) onDraftsChange([...drafts, ...accepted]);
  }

  function removeDraft(draft: PhotoDraft) {
    releaseDraft(draft);
    onDraftsChange(drafts.filter((item) => item.id !== draft.id));
  }

  return (
    <div className="space-y-3">
      {error && <Notice tone="error">{error}</Notice>}

      {total > 0 && (
        <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {existing.map((url) => (
            <li key={url} className="relative aspect-square">
              <img
                src={url}
                alt="Job photo"
                loading="lazy"
                className="size-full object-cover rounded-[2px] border border-noir-700"
              />
              {onRemoveExisting && (
                <RemoveButton
                  label="Remove photo"
                  disabled={disabled}
                  onClick={() => onRemoveExisting(url)}
                />
              )}
            </li>
          ))}

          {drafts.map((draft) => (
            <li key={draft.id} className="relative aspect-square">
              <img
                src={draft.previewUrl}
                alt=""
                className="size-full object-cover rounded-[2px] border border-noir-700"
              />
              <span className="absolute bottom-0 inset-x-0 bg-noir-900/80 text-[0.6rem] text-smoke text-center py-0.5">
                {formatBytes(draft.blob.size)}
              </span>
              <RemoveButton
                label="Remove photo"
                disabled={disabled}
                onClick={() => removeDraft(draft)}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <FileButton
          capture
          multiple
          disabled={disabled || working || room <= 0}
          onFiles={(files) => void addFiles(files)}
        >
          {working ? 'Working…' : 'Take photo'}
        </FileButton>

        <FileButton
          multiple
          disabled={disabled || working || room <= 0}
          onFiles={(files) => void addFiles(files)}
        >
          Add from phone
        </FileButton>

        <p className="text-xs text-smoke-dim">
          {total === 0
            ? 'Before shots, damp patches, awkward corners — anything worth remembering.'
            : `${total} photo${total === 1 ? '' : 's'}${room > 0 ? `, room for ${room} more` : ' — that’s the limit'}`}
        </p>
      </div>
    </div>
  );
}

function RemoveButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="absolute -top-1.5 -right-1.5 size-6 grid place-items-center rounded-full bg-noir-800 border border-noir-600 text-smoke hover:text-maroon-400 hover:border-maroon-500 disabled:opacity-40 cursor-pointer"
    >
      ×
    </button>
  );
}
