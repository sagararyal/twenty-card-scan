import { useEffect, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { RestApiClient, RestApiClientError } from 'twenty-client-sdk/rest';
import { defineFrontComponent } from 'twenty-sdk/define';
import { AppPath, closeSidePanel, enqueueSnackbar, navigate, useRecordId } from 'twenty-sdk/front-component';
import { IconInfoCircle, IconRefresh, IconWand } from 'twenty-ui/icon';
import { Button, Checkbox, Input, Textarea } from 'twenty-ui/primitives/input';
import { Text } from 'twenty-ui/primitives/typography';
import { useTheme } from 'twenty-ui/theme';

import { CARD_STATUS } from 'src/objects/scanned-card.object';
import { type CardBox, type CardRead, splitList } from 'src/logic-functions/card-schema';
import { findPersonByEmails, findPersonByName, type PersonMatch } from 'src/utils/person-match';
import type { EnrichResult } from 'src/logic-functions/enrich-company';
import type { SaveCardInput, SaveCardResult } from 'src/logic-functions/save-card';
import { StatusDot } from 'src/ui/status-dot';

export const REVIEW_CARD_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER =
  'b43308b5-ab8f-4977-83dd-4c17af748a1f';

type Card = {
  id: string;
  status: string;
  checks: string | null;
  collectedAt: string | null;
  readError: string | null;
  extracted: CardRead | null;
  photo: { url: string | null; label: string | null }[] | null;
};

type Form = {
  firstName: string;
  lastName: string;
  jobTitle: string;
  emails: string;
  phones: string;
  mobile: string;
  linkedin: string;
  companyName: string;
  website: string;
  addressLine: string;
  addressLine2: string;
  postcode: string;
  city: string;
  state: string;
  country: string;
  note: string;
  list: string;
};

const EMPTY_FORM: Form = {
  firstName: '', lastName: '', jobTitle: '', emails: '', phones: '', mobile: '', linkedin: '',
  companyName: '', website: '', addressLine: '', addressLine2: '', postcode: '', city: '', state: '', country: '', note: '', list: '',
};

const formFromCard = (card: Card): Form => {
  const read = card.extracted;

  if (!read) {
    return EMPTY_FORM;
  }

  const noteLines = [
    card.collectedAt ? `Met at ${card.collectedAt}` : '',
    read.nameOtherLanguage ? `Name on card: ${read.nameOtherLanguage}` : '',
    read.otherNotes ?? '',
  ].filter(Boolean);

  return {
    firstName: read.firstName ?? '',
    lastName: read.lastName ?? '',
    jobTitle: read.jobTitle ?? '',
    emails: read.emails ?? '',
    phones: read.phones ?? '',
    mobile: read.mobile ?? '',
    linkedin: read.linkedin ?? '',
    companyName: read.companyName ?? '',
    website: read.website ?? '',
    addressLine: read.addressLine ?? '',
    addressLine2: read.addressLine2 ?? '',
    postcode: read.postcode ?? '',
    city: read.city ?? '',
    state: read.state ?? '',
    country: read.country ?? '',
    note: noteLines.join('\n'),
    list: card.collectedAt ?? '',
  };
};

const errorMessage = (error: unknown, fallback: string) => {
  if (error instanceof RestApiClientError) {
    const body = error.body as { error?: string } | undefined;

    if (body?.error) {
      return body.error;
    }
  }

  return error instanceof Error ? error.message : fallback;
};

type FieldDef = { key: keyof Form; label: string };

const PERSON_FIELDS: FieldDef[] = [
  { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' },
  { key: 'jobTitle', label: 'Job title' },
  { key: 'emails', label: 'Email' },
  { key: 'mobile', label: 'Mobile' },
  { key: 'phones', label: 'Phone' },
  { key: 'linkedin', label: 'LinkedIn' },
];

const COMPANY_FIELDS: FieldDef[] = [
  { key: 'companyName', label: 'Name' },
  { key: 'website', label: 'Website' },
  { key: 'addressLine', label: 'Address' },
  { key: 'addressLine2', label: 'Address 2' },
  { key: 'postcode', label: 'Postcode' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'country', label: 'Country' },
];

const ReviewCard = () => {
  const theme = useTheme();
  const recordId = useRecordId();
  const [card, setCard] = useState<Card | null>(null);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [busy, setBusy] = useState<'save' | 'skip' | 'read' | 'enrich' | null>(null);
  const [loadError, setLoadError] = useState('');
  const [photoIndex, setPhotoIndex] = useState(0);
  const [showWholePhoto, setShowWholePhoto] = useState(false);
  const [toReview, setToReview] = useState<number | null>(null);
  const [enrich, setEnrich] = useState<EnrichResult | null>(null);
  const [useEnrich, setUseEnrich] = useState(true);
  const [personOpen, setPersonOpen] = useState(false);
  const [withOpportunity, setWithOpportunity] = useState(false);
  // Checked now, not when the card was read: people and companies may have been added since.
  const [live, setLive] = useState<{ byEmail: PersonMatch | null; byName: PersonMatch | null; companyExists: boolean | null } | null>(null);
  const [mergeWithNameMatch, setMergeWithNameMatch] = useState(true);

  const load = async (id: string) => {
    const client = new CoreApiClient();
    const [result, queue] = (await Promise.all([
      client.query({
        scannedCard: {
          __args: { filter: { id: { eq: id } } },
          id: true,
          status: true,
          checks: true,
          collectedAt: true,
          readError: true,
          extracted: true,
          photo: { url: true, label: true },
        },
      }),
      client.query({
        scannedCards: {
          __args: { filter: { status: { eq: CARD_STATUS.TO_REVIEW } } },
          totalCount: true,
        },
      }),
    ])) as [{ scannedCard: Card | null }, { scannedCards: { totalCount: number } }];

    if (!result.scannedCard) {
      setLoadError('This scanned card was not found');

      return;
    }

    setCard(result.scannedCard);
    setForm(formFromCard(result.scannedCard));
    setPhotoIndex(0);
    setShowWholePhoto(false);
    setEnrich(null);
    setToReview(queue.scannedCards.totalCount);
    setLive(null);
    setMergeWithNameMatch(true);
    checkLive(result.scannedCard).catch(() => setLive(null));
  };

  const checkLive = async (loaded: Card) => {
    const read = loaded.extracted;

    if (!read) return;

    const client = new CoreApiClient();
    const byEmail = await findPersonByEmails(client, splitList(read.emails));
    const byName = byEmail ? null : await findPersonByName(client, read.firstName, read.lastName);
    const domain = (read.website || splitList(read.emails)[0]?.split('@')[1] || '')
      .trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase();
    let companyExists: boolean | null = null;

    if (domain || read.companyName.trim()) {
      const companies = (await client.query({
        companies: {
          __args: {
            filter: {
              or: [
                ...(domain ? [{ domainName: { primaryLinkUrl: { ilike: `%${domain}%` } } }] : []),
                ...(read.companyName.trim() ? [{ name: { ilike: read.companyName.trim() } }] : []),
              ],
            },
            first: 1,
          },
          edges: { node: { id: true } },
        },
      })) as { companies: { edges: unknown[] } };

      companyExists = companies.companies.edges.length > 0;
    }

    setLive({ byEmail, byName, companyExists });
  };

  useEffect(() => {
    if (recordId) {
      load(recordId).catch(() => setLoadError('Could not load this scanned card'));
    }
  }, [recordId]);

  const unclear = new Set(splitList(card?.extracted?.unclear ?? '').map((field) => field.toLowerCase()));
  const isUnclear = ({ key, label }: FieldDef) =>
    unclear.has(key.toLowerCase()) || unclear.has(label.toLowerCase()) ||
    (key === 'companyName' && unclear.has('companyname'));

  const goToNextCard = async () => {
    const next = (await new CoreApiClient().query({
      scannedCards: {
        __args: {
          filter: { status: { eq: CARD_STATUS.TO_REVIEW }, id: { neq: recordId } },
          orderBy: [{ createdAt: 'AscNullsLast' }],
          first: 1,
        },
        edges: { node: { id: true } },
      },
    })) as { scannedCards: { edges: { node: { id: string } }[] } };

    const nextId = next.scannedCards.edges[0]?.node.id;

    if (nextId) {
      await navigate(AppPath.RecordShowPage, { objectNameSingular: 'scannedCard', objectRecordId: nextId });
    } else {
      await enqueueSnackbar({ message: 'All scanned cards are reviewed', variant: 'success' });
      await navigate(AppPath.RecordIndexPage, { objectNamePlural: 'scannedCards' });
      await closeSidePanel();
    }
  };

  const save = async (skip: boolean) => {
    if (!recordId) return;

    setBusy(skip ? 'skip' : 'save');

    try {
      const extra = enrich?.success && useEnrich ? enrich : null;
      const body: SaveCardInput = {
        recordId,
        skip,
        person: {
          firstName: form.firstName, lastName: form.lastName, jobTitle: form.jobTitle,
          emails: form.emails, phones: form.phones, mobile: form.mobile, linkedin: form.linkedin,
        },
        company: {
          name: form.companyName, website: form.website, addressLine: form.addressLine,
          addressLine2: form.addressLine2, postcode: form.postcode, state: form.state,
          city: form.city, country: form.country,
          linkedin: extra?.companyLinkedin ?? '',
          description: extra?.summary ?? '',
          industry: extra?.industry ?? '',
          employees: extra?.employees ?? '',
          sourceUrl: extra?.sourceUrl ?? '',
        },
        note: form.note,
        list: form.list,
        createOpportunity: !skip && withOpportunity,
        ...(live?.byName && mergeWithNameMatch ? { mergeIntoPersonId: live.byName.id } : {}),
      };
      const result = await new RestApiClient().post<SaveCardResult>('/s/cards/save', body);

      if (!result.success) throw new Error(result.error ?? 'Saving failed');

      const name = `${form.firstName} ${form.lastName}`.trim();

      await enqueueSnackbar({
        message: skip
          ? 'Card skipped'
          : `${name} ${result.personWasNew ? 'added' : 'updated'}` +
            (result.companyWasNew ? `, ${form.companyName} added` : ''),
        variant: 'success',
      });

      if (result.opportunityId) {
        // Open the new opportunity so its context gets written while it is fresh.
        await navigate(AppPath.RecordShowPage, { objectNameSingular: 'opportunity', objectRecordId: result.opportunityId });
        await closeSidePanel();

        return;
      }

      await goToNextCard();
    } catch (error) {
      await enqueueSnackbar({ message: errorMessage(error, 'Saving failed'), variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const readAgain = async () => {
    if (!recordId) return;

    setBusy('read');

    try {
      await new RestApiClient().post('/s/cards/read', { recordId });
      await load(recordId);
      await enqueueSnackbar({ message: 'Card read again', variant: 'success' });
    } catch (error) {
      await enqueueSnackbar({ message: errorMessage(error, 'Reading failed'), variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const runEnrich = async () => {
    setBusy('enrich');

    try {
      const result = await new RestApiClient().post<EnrichResult>('/s/cards/enrich', {
        website: form.website || splitList(form.emails)[0]?.split('@')[1] || '',
        companyName: form.companyName,
      });

      if (!result.success) throw new Error(result.error ?? 'Could not read the website');
      setEnrich(result);
      setUseEnrich(true);
    } catch (error) {
      await enqueueSnackbar({ message: errorMessage(error, 'Could not read the website'), variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const pad = theme.spacing[4];
  const muted = theme.font.color.tertiary;
  const centered = (content: string) => (
    <div style={{ padding: pad }}>
      <Text style={{ color: muted }}>{content}</Text>
    </div>
  );

  if (!recordId) return centered('Open a scanned card to review it');
  if (loadError) return centered(loadError);
  if (!card) return centered('Loading');

  const photos = (card.photo ?? []).filter((photo) => photo.url);
  const done = card.status === CARD_STATUS.CREATED || card.status === CARD_STATUS.SKIPPED;
  // Match lines from reading time are replaced by the live check once it is back.
  const STALE = /^(Person exists|Same name in Twenty|Company exists|New company)/;
  const checks = [
    ...(card.checks ?? '').split(' · ').filter(Boolean).filter((check) => !live || !STALE.test(check)),
    ...(live?.byEmail ? [`Person exists: ${live.byEmail.name} (same email). The card adds what the record lacks`] : []),
    ...(live?.byName ? [`Same name in Twenty: ${live.byName.name}${live.byName.email ? ` (${live.byName.email})` : ''}`] : []),
    ...(live && live.companyExists !== null ? [live.companyExists ? 'Company exists' : 'New company'] : []),
  ];
  const name = `${form.firstName} ${form.lastName}`.trim();
  const isOrganization = !name && card.extracted?.cardType === 'organization';
  const [showPerson, setShowPerson] = [!isOrganization || personOpen, setPersonOpen];

  const sectionLabel = (label: string, action?: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 28 }}>
      <Text style={{ color: muted, fontSize: theme.font.size.sm }}>{label}</Text>
      {action}
    </div>
  );

  const fieldGrid = (fields: FieldDef[]) => (
    <div style={{ display: 'grid', gridTemplateColumns: '88px minmax(0, 1fr)', columnGap: theme.spacing[2], rowGap: theme.spacing[2], alignItems: 'center' }}>
      {fields.map((field) => {
        const flagged = isUnclear(field);
        const id = `card-${field.key}`;

        return [
          <label
            key={`${field.key}-label`}
            htmlFor={id}
            style={{ color: flagged ? theme.color.orange : theme.font.color.secondary, fontSize: theme.font.size.md }}
          >
            {field.label}
          </label>,
          <Input
            key={field.key}
            id={id}
            size="sm"
            value={form[field.key]}
            aria-describedby={flagged ? `${id}-hint` : undefined}
            onValueChange={(value) => setForm((current) => ({ ...current, [field.key]: value }))}
            style={flagged ? { borderColor: theme.color.orange } : undefined}
          />,
          flagged ? (
            <span key={`${field.key}-hint`} id={`${id}-hint`} style={{ gridColumn: 2, marginTop: -4, color: theme.color.orange, fontSize: theme.font.size.xs }}>
              Hard to read on the card, please check
            </span>
          ) : null,
        ];
      })}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing[5], padding: pad, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing[2] }}>
          <StatusDot status={card.status} withLabel />
          {toReview !== null && toReview > 0 && (
            <Text style={{ color: muted, fontSize: theme.font.size.sm, fontVariantNumeric: 'tabular-nums' }}>
              {toReview} to review
            </Text>
          )}
        </div>

        {photos.length > 0 && (
          <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: theme.spacing[2] }}>
            <CardPhoto
              url={photos[Math.min(photoIndex, photos.length - 1)].url ?? ''}
              box={photoIndex === 0 && !showWholePhoto ? card.extracted?.cardBox ?? null : null}
              background={theme.background.tertiary}
              radius={theme.border.radius.md}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing[2] }}>
            {photos.length > 1 ? (
              <div style={{ display: 'flex', gap: theme.spacing[1] }} role="group" aria-label="Card side">
                {photos.map((_, index) => (
                  <Button
                    key={index}
                    size="sm"
                    variant={index === photoIndex ? 'soft' : 'ghost'}
                    color="neutral"
                    aria-pressed={index === photoIndex}
                    onClick={() => setPhotoIndex(index)}
                  >
                    {index === 0 ? 'Front' : 'Back'}
                  </Button>
                ))}
              </div>
            ) : (
              <span />
            )}
            {photoIndex === 0 && card.extracted?.cardBox ? (
              <Button size="sm" variant="ghost" color="neutral" onClick={() => setShowWholePhoto((value) => !value)}>
                {showWholePhoto ? 'Show the card only' : 'Show whole photo'}
              </Button>
            ) : null}
            </div>
          </figure>
        )}

        {card.status === CARD_STATUS.READING && <Text style={{ color: muted }}>Still being read. This takes a few seconds</Text>}
        {card.status === CARD_STATUS.FAILED && (
          <Text style={{ color: theme.font.color.danger }}>Could not read this card: {card.readError}</Text>
        )}
        {done && (
          <Text style={{ color: muted }}>
            {card.status === CARD_STATUS.CREATED ? 'Already saved. Saving again updates the person' : 'Skipped. You can still save it'}
          </Text>
        )}

        {checks.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: theme.spacing[2],
              padding: theme.spacing[3],
              borderRadius: theme.border.radius.sm,
              background: theme.background.transparent.lighter,
              border: `1px solid ${theme.border.color.light}`,
            }}
          >
            <IconInfoCircle size={16} stroke={1.5} color={theme.font.color.secondary} aria-hidden />
            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing[1] }}>
              {checks.map((check) => (
                <Text key={check} style={{ fontSize: theme.font.size.sm }}>{check}</Text>
              ))}
            </div>
          </div>
        )}

        {live?.byName && card.status !== CARD_STATUS.CREATED && (
          <label style={{ display: 'flex', alignItems: 'center', gap: theme.spacing[2], fontSize: theme.font.size.sm }}>
            <Checkbox checked={mergeWithNameMatch} onCheckedChange={(checked) => setMergeWithNameMatch(Boolean(checked))} />
            Same person as {live.byName.name}: add this card to them instead of a new person
          </label>
        )}

        <section style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing[2] }}>
          {sectionLabel(
            isOrganization ? 'Person (none on this card)' : 'Person',
            isOrganization ? (
              <Button size="sm" variant="ghost" color="neutral" onClick={() => setShowPerson(!showPerson)}>
                {showPerson ? 'Hide' : 'Add a person'}
              </Button>
            ) : undefined,
          )}
          {showPerson && fieldGrid(PERSON_FIELDS)}
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing[2] }}>
          {sectionLabel(
            'Company',
            <Button
              size="sm"
              variant="ghost"
              color="neutral"
              loading={busy === 'enrich'}
              disabled={busy !== null || !(form.website || form.emails)}
              startIcon={<IconWand size={14} stroke={1.5} />}
              onClick={runEnrich}
            >
              Enrich from website
            </Button>,
          )}
          {fieldGrid(COMPANY_FIELDS)}

          {enrich?.success && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: theme.spacing[2],
                padding: theme.spacing[3],
                borderRadius: theme.border.radius.sm,
                border: `1px solid ${theme.border.color.light}`,
              }}
            >
              <Text style={{ fontSize: theme.font.size.sm }}>{enrich.summary || 'The website did not say much'}</Text>
              <div style={{ display: 'grid', gridTemplateColumns: '88px minmax(0, 1fr)', rowGap: theme.spacing[1], columnGap: theme.spacing[2] }}>
                {(
                  [
                    ['Sector', enrich.industry],
                    ['Size', enrich.employees],
                    ['Based in', enrich.headquarters],
                    ['LinkedIn', enrich.companyLinkedin],
                  ] as const
                )
                  .filter(([, value]) => value)
                  .flatMap(([label, value]) => [
                    <Text key={`${label}-l`} style={{ color: muted, fontSize: theme.font.size.sm }}>{label}</Text>,
                    <Text key={`${label}-v`} style={{ fontSize: theme.font.size.sm, overflowWrap: 'anywhere' }}>{value}</Text>,
                  ])}
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: theme.spacing[2], fontSize: theme.font.size.sm }}>
                <Checkbox checked={useEnrich} onCheckedChange={(checked) => setUseEnrich(Boolean(checked))} />
                Add this to the company
              </label>
              {enrich.sourceUrl && (
                <Text style={{ color: muted, fontSize: theme.font.size.xs, overflowWrap: 'anywhere' }}>From {enrich.sourceUrl}</Text>
              )}
            </div>
          )}
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing[2] }}>
          {sectionLabel('List')}
          <Input
            size="sm"
            aria-label="Twenty list"
            value={form.list}
            placeholder="No list"
            onValueChange={(value) => setForm((current) => ({ ...current, list: value }))}
          />
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing[2] }}>
          {sectionLabel('Note')}
          <Textarea
            aria-label="Note"
            value={form.note}
            autoResize
            maxRows={6}
            onValueChange={(value) => setForm((current) => ({ ...current, note: value }))}
          />
        </section>
      </div>

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing[2],
          padding: `0 ${pad} ${theme.spacing[3]}`,
          fontSize: theme.font.size.sm,
          color: theme.font.color.secondary,
        }}
      >
        <Checkbox checked={withOpportunity} onCheckedChange={(checked) => setWithOpportunity(Boolean(checked))} />
        Also create an opportunity and open it
      </label>

      <div
        style={{
          position: 'sticky',
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing[2],
          padding: `${theme.spacing[3]} ${pad}`,
          borderTop: `1px solid ${theme.border.color.light}`,
          background: theme.background.primary,
        }}
      >
        <Button variant="ghost" color="neutral" size="sm" loading={busy === 'skip'} disabled={busy !== null} onClick={() => save(true)}>
          Skip
        </Button>
        <Button
          variant="ghost"
          color="neutral"
          size="sm"
          aria-label="Read the card again"
          loading={busy === 'read'}
          disabled={busy !== null}
          startIcon={<IconRefresh size={14} stroke={1.5} />}
          onClick={readAgain}
        >
          Read again
        </Button>
        <div style={{ flex: 1 }} />
        <Button
          variant="solid"
          color="accent"
          loading={busy === 'save'}
          disabled={busy !== null || card.status === CARD_STATUS.READING || !(name || form.companyName.trim())}
          onClick={() => save(false)}
        >
          {name ? `Create ${name}` : form.companyName.trim() ? `Save ${form.companyName.trim()}` : 'Create person'}
        </Button>
      </div>
    </div>
  );
};

// Shows only the card when the reader found its edges (a portrait phone photo leaves a
// lot of table around a landscape card). The stored photo is never changed.
const CardPhoto = ({
  url,
  box,
  background,
  radius,
}: {
  url: string;
  box: CardBox | null;
  background: string;
  radius: string;
}) => {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const frame = {
    width: '100%',
    borderRadius: radius,
    background,
    boxShadow: '0 1px 2px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.08)',
  };
  const width = size?.width ?? box?.photoWidth;
  const height = size?.height ?? box?.photoHeight;

  if (!box || !width || !height) {
    return (
      <img
        src={url}
        alt="The scanned business card"
        onLoad={(event) => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
        style={{ ...frame, maxHeight: 240, objectFit: 'contain' }}
      />
    );
  }

  const boxWidth = box.right - box.left;
  const boxHeight = box.bottom - box.top;
  const aspect = (boxWidth * width) / (boxHeight * height);

  return (
    <div
      role="img"
      aria-label="The scanned business card"
      style={{
        ...frame,
        // A standing (portrait) card gets a fixed height instead of the full width.
        width: aspect < 1 ? `${Math.round(320 * aspect)}px` : '100%',
        alignSelf: 'center',
        position: 'relative',
        overflow: 'hidden',
        aspectRatio: `${aspect}`,
      }}
    >
      <img
        src={url}
        alt=""
        onLoad={(event) => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
        style={{
          position: 'absolute',
          width: `${100 / boxWidth}%`,
          height: `${100 / boxHeight}%`,
          left: `${(-box.left / boxWidth) * 100}%`,
          top: `${(-box.top / boxHeight) * 100}%`,
          maxWidth: 'none',
        }}
      />
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: REVIEW_CARD_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
  name: 'Review scanned card',
  description: 'Check what was read from a business card, then create the person.',
  component: ReviewCard,
});
