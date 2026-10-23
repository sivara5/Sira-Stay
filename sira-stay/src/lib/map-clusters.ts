import type { LatLng } from './types';

/** Room one price tag takes on screen, in points: tags closer than this overlap. */
export const TAG_BOX = { width: 84, height: 32 };
/** At this zoom (longitude span in degrees, about 2 km) and closer, tags are never grouped. */
export const STREET_SPAN_DEG = 0.02;

export type MapRegion = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
/** A listing as the public API sends it: only the fuzzed point, never the house. */
export type Fuzzed = { id: string; approxLocation: LatLng };
export type TagCluster<T extends Fuzzed> = { key: string; center: LatLng; items: T[] };

const fuzzedPoint = (item: Fuzzed): LatLng => ({ lat: item.approxLocation.lat, lng: item.approxLocation.lng });

/**
 * Groups listings whose price tags would overlap on screen at the current zoom. Works only from each
 * listing's fuzzed point (`approxLocation`); a group sits at the average of its members' fuzzed points.
 * Every tag is the same distance above its point, so grouping the points groups the tags.
 */
export function clusterTags<T extends Fuzzed>(items: T[], region: MapRegion, mapSize: { width: number; height: number }): TagCluster<T>[] {
  if (region.longitudeDelta <= STREET_SPAN_DEG || !mapSize.width || !mapSize.height) {
    return items.map((item) => ({ key: item.id, center: fuzzedPoint(item), items: [item] }));
  }
  const pxPerLng = mapSize.width / region.longitudeDelta;
  const pxPerLat = mapSize.height / region.latitudeDelta;
  // A fixed order, so the same listings always form the same groups.
  const sorted = [...items].sort(
    (a, b) => a.approxLocation.lat - b.approxLocation.lat || a.approxLocation.lng - b.approxLocation.lng || a.id.localeCompare(b.id),
  );
  const groups: { x: number; y: number; items: T[] }[] = [];
  for (const item of sorted) {
    const x = item.approxLocation.lng * pxPerLng;
    const y = item.approxLocation.lat * pxPerLat;
    const group = groups.find((g) => Math.abs(g.x - x) < TAG_BOX.width && Math.abs(g.y - y) < TAG_BOX.height);
    if (group) group.items.push(item);
    else groups.push({ x, y, items: [item] });
  }
  return groups.map(({ items: members }) => ({
    key: members.map((m) => m.id).sort().join(','),
    center: {
      lat: members.reduce((sum, m) => sum + m.approxLocation.lat, 0) / members.length,
      lng: members.reduce((sum, m) => sum + m.approxLocation.lng, 0) / members.length,
    },
    items: members,
  }));
}

/**
 * Where tapping a group zooms to: centred on its members' fuzzed points, with all of them in view, and at
 * least 2× closer than `current` so every tap makes progress. Tight groups go straight to street zoom,
 * where tags are never grouped. (Members are at most two tag-widths apart, well within half the map.)
 */
export function regionForCluster(cluster: TagCluster<Fuzzed>, current: MapRegion): MapRegion {
  const lats = cluster.items.map((i) => i.approxLocation.lat);
  const lngs = cluster.items.map((i) => i.approxLocation.lng);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const closest = STREET_SPAN_DEG * 0.9;
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.min(Math.max((maxLat - minLat) * 2, closest), current.latitudeDelta / 2),
    longitudeDelta: Math.min(Math.max((maxLng - minLng) * 2, closest), current.longitudeDelta / 2),
  };
}
