import { defineApplication, FieldType } from 'twenty-sdk/define';

import {
  APP_DESCRIPTION,
  APP_DISPLAY_NAME,
  APPLICATION_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineApplication({
  universalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
  displayName: APP_DISPLAY_NAME,
  description: APP_DESCRIPTION,
  applicationVariables: {
    CAMERA_PAGE_URL: {
      universalIdentifier: '6d956195-6f5b-4f6c-b94f-2a02cc3091ec',
      description:
        'Address of the Card Scan camera page (live view, cards taken by themselves). Change it to use your own copy of camera/index.html; leave empty to hide the camera button.',
      value: 'https://sagararyal.github.io/twenty-card-scan/camera/',
      isSecret: false,
    },
    REVIEW_MODE: {
      universalIdentifier: 'a46bde4f-9e92-4d46-8942-ec00bd53ee78',
      label: 'Saving',
      type: FieldType.SELECT,
      description:
        'Auto when clear: a card with a full name, an email, nothing hard to read and no conflicts is saved by itself. Everything else waits for review.',
      options: [
        { label: 'Auto when clear', value: 'auto' },
        { label: 'Review every card', value: 'manual' },
      ],
      value: 'auto',
      isSecret: false,
    },
    PHOTO_RETENTION_DAYS: {
      universalIdentifier: '063775e3-40a6-4d5d-a817-baf8e4c5ccef',
      label: 'Keep card photos (days)',
      type: FieldType.NUMBER,
      description:
        'Photos of saved or skipped cards are removed after this many days. The person, company and read fields stay. 0 keeps photos forever.',
      value: 365,
      isSecret: false,
    },
  },
});
