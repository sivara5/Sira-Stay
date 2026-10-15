import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

export type PickedImage = {
  uri: string;
  width: number;
  height: number;
  fileSize?: number;
  assetId?: string | null;
  mimeType?: string;
  fileName?: string | null;
};

/** Opens the camera; returns null if cancelled or permission denied. */
export async function takePhoto(): Promise<PickedImage | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('Camera permission needed', 'Allow camera access in Settings to take photos.');
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
  return result.canceled ? null : result.assets[0];
}

/** Opens the gallery. `limit` > 1 enables multi-select. */
export async function choosePhotos(limit = 1): Promise<PickedImage[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    orderedSelection: true,
    quality: 0.8,
  });
  return result.canceled ? [] : result.assets;
}

export const imageMime = (img: PickedImage) => img.mimeType ?? 'image/jpeg';
export const imageName = (img: PickedImage, fallback: string) => img.fileName ?? `${fallback}.${imageMime(img).split('/')[1] ?? 'jpg'}`;
