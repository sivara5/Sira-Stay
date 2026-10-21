import { Image, type ImageStyle } from 'expo-image';
import type { StyleProp } from 'react-native';

import { colors } from '@/constants/theme';
import { mediaUrl } from '@/lib/api';
import type { PhotoView } from '@/lib/types';

type Props = {
  /** A listing photo (preferred: has smaller sizes + blurred preview)… */
  photo?: PhotoView | null;
  /** …or a plain URL (e.g. a booking's cover photo). */
  uri?: string | null;
  size?: 'card' | 'large';
  /** 'high' for what's on screen first, 'low' for photos further along. */
  priority?: 'low' | 'normal' | 'high';
  style?: StyleProp<ImageStyle>;
};

/**
 * Shows a tiny blurred preview immediately, then fades in the right-sized photo.
 * Downloaded photos are kept on the phone (memory + disk), so they also show offline.
 */
export function ProgressiveImage({ photo, uri, size = 'card', priority = 'normal', style }: Props) {
  const src = mediaUrl(photo ? (size === 'large' ? photo.large : photo.card) : uri);
  const placeholder = photo?.thumbhash ? { thumbhash: photo.thumbhash } : photo?.tiny ? { uri: mediaUrl(photo.tiny) } : undefined;
  return (
    <Image
      source={src ? { uri: src } : undefined}
      placeholder={placeholder}
      placeholderContentFit="cover"
      contentFit="cover"
      cachePolicy="memory-disk"
      priority={priority}
      recyclingKey={src}
      transition={250}
      style={[{ backgroundColor: colors.surface }, style]}
    />
  );
}
