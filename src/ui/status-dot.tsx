import { Text } from 'twenty-ui/primitives/typography';
import { useTheme } from 'twenty-ui/theme';

// The signature detail: one small dot per card state, the same everywhere.
const LABELS: Record<string, string> = {
  UPLOADING: 'Uploading',
  UPLOAD_FAILED: 'Upload failed',
  READING: 'Reading',
  TO_REVIEW: 'To review',
  CREATED: 'Created',
  SKIPPED: 'Skipped',
  FAILED: 'Could not read',
};

export const StatusDot = ({ status, withLabel = false }: { status: string; withLabel?: boolean }) => {
  const theme = useTheme();
  const color =
    status === 'TO_REVIEW' ? theme.color.blue
      : status === 'CREATED' ? theme.color.green
        : status === 'FAILED' || status === 'UPLOAD_FAILED' ? theme.color.red
          : theme.font.color.light;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: theme.spacing[2] }}>
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: 4, background: color, flexShrink: 0 }} />
      {withLabel ? (
        <Text style={{ fontSize: theme.font.size.sm, color: theme.font.color.secondary }}>{LABELS[status] ?? status}</Text>
      ) : (
        <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          {LABELS[status] ?? status}
        </span>
      )}
    </span>
  );
};
