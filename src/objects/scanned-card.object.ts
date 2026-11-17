import { FieldType, defineObject } from 'twenty-sdk/define';

// A photographed business card, from upload to a saved Person.
// Status moves: READING -> TO_REVIEW -> CREATED or SKIPPED (FAILED when the read fails).

export const SCANNED_CARD_UNIVERSAL_IDENTIFIER =
  'b7be801b-00f5-472a-a811-266d565eda36';

export const CARD_NAME_FIELD_UNIVERSAL_IDENTIFIER =
  '9c37f5b4-78cd-4d7d-9a9d-5a37dac5c00e';
export const CARD_PHOTO_FIELD_UNIVERSAL_IDENTIFIER =
  'ce0ee4cd-bc9f-4333-86ce-5e4c96699e17';
export const CARD_STATUS_FIELD_UNIVERSAL_IDENTIFIER =
  '42f96a15-95ed-4c60-a893-84b755cbc0d6';
export const CARD_EXTRACTED_FIELD_UNIVERSAL_IDENTIFIER =
  'eea7c0a6-7811-4fc4-92a5-e0ded19dd79b';
export const CARD_COMPANY_FIELD_UNIVERSAL_IDENTIFIER =
  'ea641ae4-5ab8-4504-a250-b80208178621';
export const CARD_CHECKS_FIELD_UNIVERSAL_IDENTIFIER =
  '5216b054-ddbe-4478-a78f-64e5e649625f';
export const CARD_EVENT_FIELD_UNIVERSAL_IDENTIFIER =
  '26d7e668-58fb-4aed-832e-3f0a404c7b97';
export const CARD_ERROR_FIELD_UNIVERSAL_IDENTIFIER =
  'da444790-7027-489f-a009-90452123064b';

export const CARD_STATUS = {
  READING: 'READING',
  TO_REVIEW: 'TO_REVIEW',
  CREATED: 'CREATED',
  SKIPPED: 'SKIPPED',
  FAILED: 'FAILED',
} as const;

export default defineObject({
  universalIdentifier: SCANNED_CARD_UNIVERSAL_IDENTIFIER,
  nameSingular: 'scannedCard',
  namePlural: 'scannedCards',
  labelSingular: 'Scanned card',
  labelPlural: 'Scanned cards',
  description: 'A photographed business card, waiting to become a person',
  icon: 'IconId',
  labelIdentifierFieldMetadataUniversalIdentifier:
    CARD_NAME_FIELD_UNIVERSAL_IDENTIFIER,
  fields: [
    {
      universalIdentifier: CARD_NAME_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Name',
      description: 'The name read from the card',
      icon: 'IconUser',
    },
    {
      universalIdentifier: CARD_PHOTO_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.FILES,
      name: 'photo',
      label: 'Photo',
      description: 'Front (and back) of the card',
      icon: 'IconPhoto',
      universalSettings: { maxNumberOfValues: 2 },
    },
    {
      universalIdentifier: CARD_STATUS_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.SELECT,
      name: 'status',
      label: 'Status',
      description: 'Where this card is: being read, to review, created, skipped or failed',
      icon: 'IconProgress',
      defaultValue: `'${CARD_STATUS.READING}'`,
      options: [
        { id: '6af384b7-5b06-432d-846d-e26612efb402', value: CARD_STATUS.READING, label: 'Reading', color: 'gray', position: 0 },
        { id: '483dffdc-e551-4f5d-8e71-fb8ff97fd3ba', value: CARD_STATUS.TO_REVIEW, label: 'To review', color: 'blue', position: 1 },
        { id: 'd2359382-6c89-4681-9748-631d3b607a92', value: CARD_STATUS.CREATED, label: 'Created', color: 'green', position: 2 },
        { id: '4ac25ee8-acb0-447d-ba72-f7440cb18834', value: CARD_STATUS.SKIPPED, label: 'Skipped', color: 'gray', position: 3 },
        { id: '91ed3b91-fa53-4a96-a47b-0ffcf12601df', value: CARD_STATUS.FAILED, label: 'Failed', color: 'red', position: 4 },
      ],
    },
    {
      universalIdentifier: CARD_COMPANY_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'companyName',
      label: 'Company (read)',
      description: 'The company name read from the card',
      icon: 'IconBuildingSkyscraper',
    },
    {
      universalIdentifier: CARD_CHECKS_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'checks',
      label: 'Check',
      description: 'What to look at before saving: unclear fields, a possible duplicate, an existing company',
      icon: 'IconAlertTriangle',
    },
    {
      universalIdentifier: CARD_EVENT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'collectedAt',
      label: 'List',
      description: 'The Twenty List the person goes on when saved, for example the event',
      icon: 'IconCalendarEvent',
    },
    {
      universalIdentifier: CARD_EXTRACTED_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.RAW_JSON,
      name: 'extracted',
      label: 'Read fields',
      description: 'Everything the model read from the card, with how sure it was',
      icon: 'IconBraces',
    },
    {
      universalIdentifier: CARD_ERROR_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'readError',
      label: 'Read error',
      description: 'Why reading the card failed, when it did',
      icon: 'IconAlertCircle',
    },
  ],
});
