import { STREET_SPAN_DEG, clusterTags, regionForCluster, type Fuzzed, type MapRegion, type TagCluster } from '../map-clusters';

const SCREEN = { width: 400, height: 700 };
const STATE: MapRegion = { latitude: 11, longitude: 78.5, latitudeDelta: 6, longitudeDelta: 5 };
const CHENNAI: MapRegion = { latitude: 13.03, longitude: 80.22, latitudeDelta: 0.3, longitudeDelta: 0.25 };
const STREET: MapRegion = { latitude: 13.08, longitude: 80.21, latitudeDelta: 0.015, longitudeDelta: 0.015 };

// `exact` is a decoy far from every fuzzed point: grouping must never look at it.
const listing = (id: string, lat: number, lng: number) => ({ id, approxLocation: { lat, lng, radiusM: 400 }, exact: { lat: 0, lng: 0 } });
const annaNagar = listing('anna-nagar', 13.08, 80.21);
const nextDoor = listing('next-door', 13.0805, 80.212); // ~250 m from Anna Nagar
const velachery = listing('velachery', 13.04, 80.24);
const tambaram = listing('tambaram', 12.98, 80.22);
const madurai = listing('madurai', 9.92, 78.12);

const ids = (clusters: TagCluster<Fuzzed>[]) => clusters.map((c) => c.items.map((i) => i.id).sort()).sort();
const inside = (region: MapRegion, item: Fuzzed) =>
  Math.abs(item.approxLocation.lat - region.latitude) <= region.latitudeDelta / 2 &&
  Math.abs(item.approxLocation.lng - region.longitude) <= region.longitudeDelta / 2;

describe('clusterTags', () => {
  it('groups the Chennai listings at state zoom and leaves Madurai alone', () => {
    expect(ids(clusterTags([annaNagar, velachery, tambaram, madurai], STATE, SCREEN))).toEqual([
      ['anna-nagar', 'tambaram', 'velachery'],
      ['madurai'],
    ]);
  });

  it('groups only tags that still overlap at district zoom', () => {
    expect(ids(clusterTags([annaNagar, nextDoor, velachery], CHENNAI, SCREEN))).toEqual([['anna-nagar', 'next-door'], ['velachery']]);
  });

  it('never groups at street zoom', () => {
    expect(STREET.longitudeDelta).toBeLessThanOrEqual(STREET_SPAN_DEG);
    expect(clusterTags([annaNagar, nextDoor], STREET, SCREEN)).toHaveLength(2);
  });

  it('does not group before the map has a size', () => {
    expect(clusterTags([annaNagar, velachery], STATE, { width: 0, height: 0 })).toHaveLength(2);
  });

  it('places a group at the average of its fuzzed points, never an exact location', () => {
    const [group] = clusterTags([annaNagar, velachery, tambaram], STATE, SCREEN);
    expect(group.center.lat).toBeCloseTo((13.08 + 13.04 + 12.98) / 3, 10);
    expect(group.center.lng).toBeCloseTo((80.21 + 80.24 + 80.22) / 3, 10);
  });

  it('forms the same groups whatever order the listings arrive in', () => {
    const items = [annaNagar, nextDoor, velachery, tambaram, madurai];
    const forward = clusterTags(items, STATE, SCREEN);
    const backward = clusterTags([...items].reverse(), STATE, SCREEN);
    expect(backward.map((c) => [c.key, c.center])).toEqual(forward.map((c) => [c.key, c.center]));
  });
});

describe('regionForCluster', () => {
  it('splits a group in a few taps, zooming in at least 2× each time and keeping every member in view', () => {
    const chennai = [annaNagar, nextDoor, velachery, tambaram];
    let region = STATE;
    let group = clusterTags(chennai, region, SCREEN).find((c) => c.items.length > 1);
    let taps = 0;
    while (group) {
      const next = regionForCluster(group, region);
      expect(next.longitudeDelta).toBeLessThanOrEqual(region.longitudeDelta / 2);
      group.items.forEach((item) => expect(inside(next, item)).toBe(true));
      region = next;
      group = clusterTags(chennai, region, SCREEN).find((c) => c.items.length > 1);
      taps++;
      expect(taps).toBeLessThan(10);
    }
    expect(region.longitudeDelta).toBeLessThan(STATE.longitudeDelta);
  });

  it('goes straight to street zoom for listings almost on top of each other', () => {
    const [pair] = clusterTags([annaNagar, nextDoor], CHENNAI, SCREEN);
    expect(regionForCluster(pair, CHENNAI).longitudeDelta).toBeLessThanOrEqual(STREET_SPAN_DEG);
  });
});
