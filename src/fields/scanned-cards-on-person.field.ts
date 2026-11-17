import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { SCANNED_CARD_UNIVERSAL_IDENTIFIER } from 'src/objects/scanned-card.object';
import {
  PERSON_ON_SCANNED_CARD_UNIVERSAL_IDENTIFIER,
  SCANNED_CARDS_ON_PERSON_UNIVERSAL_IDENTIFIER,
} from 'src/fields/person-on-scanned-card.field';

export default defineField({
  universalIdentifier: SCANNED_CARDS_ON_PERSON_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.RELATION,
  name: 'scannedCards',
  label: 'Scanned cards',
  icon: 'IconId',
  relationTargetObjectMetadataUniversalIdentifier:
    SCANNED_CARD_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    PERSON_ON_SCANNED_CARD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
