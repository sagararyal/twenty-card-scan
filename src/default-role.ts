import { SystemPermissionFlag, defineApplicationRole } from 'twenty-sdk/define';

import {
  APP_DISPLAY_NAME,
  DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

// The app's functions read and write records (scanned cards, people, companies,
// attachments) and call the workspace AI model. They never delete anything.
export default defineApplicationRole({
  universalIdentifier: DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
  label: `${APP_DISPLAY_NAME} default function role`,
  description: `${APP_DISPLAY_NAME} default function role`,
  recordsPermissions: {
    canReadAllRecords: true,
    canUpdateAllRecords: true,
    canSoftDeleteAllRecords: false,
    canDestroyAllRecords: false,
  },
  permissionFlagUniversalIdentifiers: [
    SystemPermissionFlag.AI,
    SystemPermissionFlag.UPLOAD_FILE,
    SystemPermissionFlag.DOWNLOAD_FILE,
  ],
  canBeAssignedToUsers: false,
  canBeAssignedToApiKeys: false,
});
