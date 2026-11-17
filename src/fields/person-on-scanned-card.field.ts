import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { SCANNED_CARD_UNIVERSAL_IDENTIFIER } from 'src/objects/scanned-card.object';

export const PERSON_ON_SCANNED_CARD_UNIVERSAL_IDENTIFIER =
  '9f40b4c5-c6ef-40bf-9142-f0b00470b290';
export const SCANNED_CARDS_ON_PERSON_UNIVERSAL_IDENTIFIER =
  '059cb64c-3b5b-4ce4-bb11-d3ad27920304';

// The person a scanned card became. The card (and its photo) then shows on the person.
export default defineField({
  universalIdentifier: PERSON_ON_SCANNED_CARD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: SCANNED_CARD_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'person',
  label: 'Person',
  icon: 'IconUser',
  relationTargetObjectMetadataUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  relationTargetFieldMetadataUniversalIdentifier:
    SCANNED_CARDS_ON_PERSON_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'personId',
  },
});
