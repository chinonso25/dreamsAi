import * as FileSystem from 'expo-file-system/legacy';

/** iOS changes the sandbox UUID on app updates. Resolve only our known audio paths. */
export function currentRecordingUri(uri: string): string {
  const match = uri.match(/^file:\/\/(?:[^?#%\\]+\/)?Containers\/Data\/Application\/[\da-f-]{36}\/(Documents\/dreamer-recordings\/[A-Za-z0-9_-]+\.m4a|Library\/Caches\/(?:ExpoAudio|Audio)\/[A-Za-z0-9_-]+\.m4a)$/i);
  if (!match) return uri;
  const relative = match[1];
  if (relative.startsWith('Documents/') && FileSystem.documentDirectory) return `${FileSystem.documentDirectory.replace(/\/?$/, '/')}${relative.slice('Documents/'.length)}`;
  if (relative.startsWith('Library/Caches/') && FileSystem.cacheDirectory) return `${FileSystem.cacheDirectory.replace(/\/?$/, '/')}${relative.slice('Library/Caches/'.length)}`;
  return uri;
}
