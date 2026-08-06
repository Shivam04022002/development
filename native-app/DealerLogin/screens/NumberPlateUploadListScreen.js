import React, { useCallback } from 'react';
import PendingUploadListView from '../components/PendingUploadListView';
import { fetchPendingNumberPlate } from '../utils/vehicleDocsApi';

/**
 * Number Plate Upload — pending list.
 *
 * Shares PendingUploadListView with the RC module; only the copy, the fetch
 * function and the detail route differ.
 */
export default function NumberPlateUploadListScreen({ navigation, route }) {
  const onSelectItem = useCallback(
    (item) => navigation.navigate('NumberPlateUploadDetails', { item }),
    [navigation]
  );
  const onRemovedHandled = useCallback(
    () => navigation.setParams({ uploadedApplicationId: undefined }),
    [navigation]
  );
  const onLogout = useCallback(() => navigation.replace('Login'), [navigation]);

  return (
    <PendingUploadListView
      title="Number Plate Upload"
      subtitle="Upload Number Plate for approved applications"
      emptyText="No Pending Number Plate Uploads"
      errorText="Could not load pending number plate uploads."
      fetchItems={fetchPendingNumberPlate}
      onSelectItem={onSelectItem}
      onLogout={onLogout}
      removedApplicationId={route?.params?.uploadedApplicationId}
      onRemovedHandled={onRemovedHandled}
    />
  );
}
