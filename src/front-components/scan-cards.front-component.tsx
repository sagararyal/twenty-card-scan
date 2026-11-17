import { useEffect, useRef, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { defineFrontComponent } from 'twenty-sdk/define';
import { AppPath, enqueueSnackbar, navigate, uploadFile } from 'twenty-sdk/front-component';
import { IconCamera, IconChevronRight, IconPhoto } from 'twenty-ui/icon';
import { Button, Input } from 'twenty-ui/primitives/input';
import { Text } from 'twenty-ui/primitives/typography';
import { useTheme } from 'twenty-ui/theme';

import { CARD_STATUS } from 'src/objects/scanned-card.object';
import { StatusDot } from 'src/ui/status-dot';
import { fetchPhotoFieldMetadataId } from 'src/utils/photo-field-id';

export const SCAN_CARDS_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER =
  'd8a5ef73-d9db-4c03-8f34-2832912b6ecf';

const MAX_FILES_PER_BATCH = 30;
const POLL_INTERVAL_MS = 3000;

type Row = {
  key: string;
  fileName: string;
  previewUrl: string;
  recordId: string | null;
  status: 'UPLOADING' | 'UPLOAD_FAILED' | (typeof CARD_STATUS)[keyof typeof CARD_STATUS];
  name: string;
  checks: string;
};

type CameraSessionResponse = { success: boolean; cameraUrl?: string | null };

const cameraHost = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return 'the camera page';
  }
};

const ScanCards = () => {
  const theme = useTheme();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const [photoFieldId, setPhotoFieldId] = useState<string | null>(null);
  const [collectedAt, setCollectedAt] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [cameraUrl, setCameraUrl] = useState<string | null>(null);
  const [lists, setLists] = useState<string[]>([]);

  useEffect(() => {
    fetchPhotoFieldMetadataId()
      .then(setPhotoFieldId)
      .catch(() => setPhotoFieldId(null));

    // Recent Twenty lists, offered as one-tap choices.
    new CoreApiClient()
      .query({
        messageLists: {
          __args: { orderBy: [{ createdAt: 'DescNullsLast' }], first: 6 },
          edges: { node: { name: true } },
        },
      })
      .then((result) => {
        const edges = (result as { messageLists: { edges: { node: { name: string | null } }[] } }).messageLists.edges;

        setLists(edges.map((edge) => edge.node.name ?? '').filter(Boolean));
      })
      .catch(() => setLists([]));
  }, []);

  // A fresh camera link whenever "Collected at" settles, so the camera page starts with it.
  useEffect(() => {
    const timer = setTimeout(() => {
      new RestApiClient()
        .post<CameraSessionResponse>('/s/cards/camera-session', { collectedAt: collectedAt.trim() })
        .then((result) => setCameraUrl(result.success ? (result.cameraUrl ?? null) : null))
        .catch(() => setCameraUrl(null));
    }, 500);

    return () => clearTimeout(timer);
  }, [collectedAt]);

  const updateRow = (key: string, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  // Cards are read on the server; this only refreshes what the list shows.
  const pendingIds = rows
    .filter((row) => row.recordId && row.status === CARD_STATUS.READING)
    .map((row) => row.recordId as string);

  useEffect(() => {
    if (pendingIds.length === 0) return;

    const timer = setInterval(async () => {
      try {
        const result = (await new CoreApiClient().query({
          scannedCards: {
            __args: { filter: { id: { in: pendingIds } } },
            edges: { node: { id: true, status: true, name: true, checks: true } },
          },
        })) as {
          scannedCards: {
            edges: { node: { id: string; status: Row['status']; name: string | null; checks: string | null } }[];
          };
        };

        setRows((current) =>
          current.map((row) => {
            const fresh = result.scannedCards.edges.find((edge) => edge.node.id === row.recordId)?.node;

            return fresh ? { ...row, status: fresh.status, name: fresh.name ?? '', checks: fresh.checks ?? '' } : row;
          }),
        );
      } catch {
        // keep polling; a missed refresh is harmless
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [pendingIds.join(',')]);

  const addFiles = async (files: File[]) => {
    if (!photoFieldId) {
      enqueueSnackbar({ message: 'Card Scan is still loading, try again in a moment', variant: 'error' });

      return;
    }

    const batch = files.slice(0, MAX_FILES_PER_BATCH);

    if (files.length > MAX_FILES_PER_BATCH) {
      enqueueSnackbar({ message: `Only the first ${MAX_FILES_PER_BATCH} photos were added`, variant: 'info' });
    }

    const newRows: Row[] = batch.map((file, index) => ({
      key: `${Date.now()}-${index}-${file.name}`,
      fileName: file.name,
      previewUrl: URL.createObjectURL(file),
      recordId: null,
      status: 'UPLOADING',
      name: '',
      checks: '',
    }));

    setRows((current) => [...newRows, ...current]);

    // One at a time keeps a phone on a weak connection from timing out.
    for (const [index, file] of batch.entries()) {
      const row = newRows[index];
      const fileName = file.name || `card-${index + 1}.jpg`;
      const uploaded = await uploadFile(file, { fieldMetadataId: photoFieldId, fileName });

      if (uploaded.status !== 'uploaded') {
        updateRow(row.key, { status: 'UPLOAD_FAILED' });
        continue;
      }

      try {
        const created = (await new CoreApiClient().mutation({
          createScannedCard: {
            __args: {
              data: {
                name: 'Reading…',
                collectedAt: collectedAt.trim(),
                photo: [{ fileId: uploaded.file.fileId, label: fileName }],
              },
            },
            id: true,
          },
        })) as { createScannedCard: { id: string } };

        updateRow(row.key, { recordId: created.createScannedCard.id, status: CARD_STATUS.READING });
      } catch {
        updateRow(row.key, { status: 'UPLOAD_FAILED' });
      }
    }
  };

  const onFilesPicked = (event: { target: HTMLInputElement }) => {
    const files = Array.from(event.target.files ?? []);

    event.target.value = '';

    if (files.length > 0) void addFiles(files);
  };

  const readyCount = rows.filter((row) => row.status === CARD_STATUS.TO_REVIEW).length;
  const busyCount = rows.filter((row) => row.status === 'UPLOADING' || row.status === CARD_STATUS.READING).length;
  const muted = theme.font.color.tertiary;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing[5], padding: theme.spacing[4] }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing[1] }}>
        <label htmlFor="card-scan-list">
          <Text style={{ color: theme.font.color.secondary, fontSize: theme.font.size.sm }}>Add to list</Text>
        </label>
        <Input
          id="card-scan-list"
          size="sm"
          value={collectedAt}
          placeholder="For example Spring Expo"
          onValueChange={(value) => setCollectedAt(value)}
        />
        {lists.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing[1], marginTop: theme.spacing[1] }}>
            {lists.map((list) => (
              <Button
                key={list}
                size="sm"
                variant={collectedAt.trim() === list ? 'soft' : 'ghost'}
                color="neutral"
                aria-pressed={collectedAt.trim() === list}
                onClick={() => setCollectedAt(collectedAt.trim() === list ? '' : list)}
              >
                {list}
              </Button>
            ))}
          </div>
        )}
        <Text style={{ color: muted, fontSize: theme.font.size.xs }}>
          Everyone you save from these cards goes on this Twenty list
        </Text>
      </div>

      {/* Opens the camera straight away on phones. */}
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onFilesPicked} />
      {/* Many photos at once, for cards already shot with the phone camera. */}
      <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={onFilesPicked} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing[2] }}>
        {cameraUrl ? (
          <a
            href={cameraUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: theme.spacing[3],
              padding: theme.spacing[3],
              borderRadius: theme.border.radius.md,
              background: theme.color.blue,
              color: '#fff',
              textDecoration: 'none',
            }}
          >
            <IconCamera size={20} stroke={1.5} aria-hidden />
            <span style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
              <span style={{ fontWeight: 500 }}>Scan with camera</span>
              <span style={{ fontSize: theme.font.size.sm, opacity: 0.85 }}>Lay cards down one by one, each is taken by itself</span>
            </span>
            <IconChevronRight size={16} stroke={1.5} aria-hidden />
          </a>
        ) : (
          // Shown at once; the camera link takes a moment to make.
          <div
            aria-busy="true"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: theme.spacing[3],
              padding: theme.spacing[3],
              borderRadius: theme.border.radius.md,
              background: theme.color.blue,
              color: '#fff',
              opacity: 0.6,
            }}
          >
            <IconCamera size={20} stroke={1.5} aria-hidden />
            <span style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
              <span style={{ fontWeight: 500 }}>Scan with camera</span>
              <span style={{ fontSize: theme.font.size.sm, opacity: 0.85 }}>Getting the camera ready</span>
            </span>
          </div>
        )}
        {cameraUrl ? (
          <Text style={{ color: muted, fontSize: theme.font.size.xs }}>
            Opens {cameraHost(cameraUrl)}, Card Scan's camera page. Your browser asks there to use the camera
          </Text>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: theme.spacing[2] }}>
          <Button
            variant={cameraUrl ? 'outline' : 'solid'}
            color={cameraUrl ? 'neutral' : 'accent'}
            disabled={!photoFieldId}
            startIcon={<IconCamera size={14} stroke={1.5} />}
            onClick={() => cameraInputRef.current?.click()}
          >
            {rows.length === 0 ? 'Take a photo' : 'Next card'}
          </Button>
          <Button
            variant="outline"
            color="neutral"
            disabled={!photoFieldId}
            startIcon={<IconPhoto size={14} stroke={1.5} />}
            onClick={() => fileInputRef.current?.click()}
          >
            From photos
          </Button>
        </div>

        {rows.length === 0 && (
          <Text style={{ color: muted, fontSize: theme.font.size.sm }}>
            Cards are read in the background. Review them under Scanned cards when you are done
          </Text>
        )}
      </div>

      {rows.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing[2] }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: muted, fontSize: theme.font.size.sm, fontVariantNumeric: 'tabular-nums' }}>
              {rows.length} this session{busyCount > 0 ? ` · ${busyCount} in progress` : ''}
            </Text>
            <Button
              size="sm"
              variant="ghost"
              color="neutral"
              disabled={readyCount === 0}
              endIcon={<IconChevronRight size={14} stroke={1.5} />}
              onClick={() => navigate(AppPath.RecordIndexPage, { objectNamePlural: 'scannedCards' })}
            >
              Review {readyCount > 0 ? readyCount : ''}
            </Button>
          </div>

          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', border: `1px solid ${theme.border.color.light}`, borderRadius: theme.border.radius.md }}>
            {rows.map((row, index) => (
              <li
                key={row.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: theme.spacing[3],
                  padding: theme.spacing[2],
                  borderTop: index === 0 ? 'none' : `1px solid ${theme.border.color.light}`,
                }}
              >
                <img
                  src={row.previewUrl}
                  alt=""
                  style={{ width: 56, height: 36, objectFit: 'cover', borderRadius: theme.border.radius.xs, background: theme.background.tertiary, flexShrink: 0 }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                  <Text style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.name && row.name !== 'Reading…' ? row.name : 'Card ' + (rows.length - index)}
                  </Text>
                  {row.checks ? (
                    <Text style={{ color: muted, fontSize: theme.font.size.xs, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.checks}
                    </Text>
                  ) : null}
                </div>
                <StatusDot status={row.status} withLabel />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: SCAN_CARDS_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
  name: 'Scan business cards',
  description: 'Photograph business cards; each is read in the background.',
  component: ScanCards,
});
