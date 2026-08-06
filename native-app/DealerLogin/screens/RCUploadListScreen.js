import React, { useCallback } from 'react';
import PendingUploadListView from '../components/PendingUploadListView';
import { fetchPendingRc } from '../utils/vehicleDocsApi';

/**
 * RC Upload — pending list.
 *
 * The list itself (search, debounce, refresh-on-focus, optimistic removal,
 * loading / empty / error states) lives in PendingUploadListView, shared with
 * the Number Plate module. This screen supplies only what differs.
 */
export default function RCUploadListScreen({ navigation, route }) {
  const onSelectItem = useCallback(
    (item) => navigation.navigate('RCUploadDetails', { item }),
    [navigation]
  );
  const onRemovedHandled = useCallback(
    () => navigation.setParams({ uploadedApplicationId: undefined }),
    [navigation]
  );
  const onLogout = useCallback(() => navigation.replace('Login'), [navigation]);

  return (
    <PendingUploadListView
      title="RC Upload"
      subtitle="Upload RC for approved applications"
      emptyText="No Pending RC Uploads"
      errorText="Could not load pending RC uploads."
      fetchItems={fetchPendingRc}
      onSelectItem={onSelectItem}
      onLogout={onLogout}
      removedApplicationId={route?.params?.uploadedApplicationId}
      onRemovedHandled={onRemovedHandled}
    />
  );
}
