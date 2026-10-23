import cases from '../../../../shared/location-leak-cases.json';
import { findLocationLeaks } from '../text-leaks';

// Same cases as the server's copy of the detector (server/test/text-leaks.test.js).
describe('findLocationLeaks', () => {
  it.each(cases.leaks)('finds the $kind in "$text"', ({ text, kind, match }) => {
    expect(findLocationLeaks(text)[0]).toEqual({ kind, text: match });
  });

  it.each(cases.clean)('leaves "%s" alone', (text) => {
    expect(findLocationLeaks(text)).toEqual([]);
  });

  it('reports every leak in reading order', () => {
    expect(findLocationLeaks('Call 98765 43210. 12, 3rd Street, Chennai 600040')).toEqual([
      { kind: 'phone', text: '98765 43210' },
      { kind: 'street', text: '12, 3rd Street' },
      { kind: 'pincode', text: '600040' },
    ]);
  });
});
