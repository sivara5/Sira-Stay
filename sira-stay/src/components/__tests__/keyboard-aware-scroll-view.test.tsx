import { act, render, screen } from '@testing-library/react-native';
import { DeviceEventEmitter, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { KeyboardAwareScrollView, scrollToReveal } from '@/components/keyboard-aware-scroll-view';

// A phone with the keyboard top at y=500 and the scroll view starting under a 100 pt header.
const screenWithKeyboard = { visibleTop: 100, keyboardTop: 500 };

describe('scrollToReveal', () => {
  it('scrolls a covered comment box and Submit button up above the keyboard, with a gap', () => {
    expect(scrollToReveal({ ...screenWithKeyboard, blockTop: 550, blockBottom: 720 })).toBe(232);
  });

  it('leaves a block that is already above the keyboard alone', () => {
    expect(scrollToReveal({ ...screenWithKeyboard, blockTop: 200, blockBottom: 400 })).toBe(0);
  });

  it('keeps the text box in view when the block is taller than the space above the keyboard', () => {
    // Showing the bottom would push the top above the scroll view, so the top goes just below it instead.
    expect(scrollToReveal({ ...screenWithKeyboard, blockTop: 450, blockBottom: 1000 })).toBe(338);
  });

  it('never scrolls the other way', () => {
    expect(scrollToReveal({ ...screenWithKeyboard, blockTop: 50, blockBottom: 700 })).toBe(0);
  });
});

describe('KeyboardAwareScrollView', () => {
  const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 24 } };

  it('adds room below the content while the keyboard is up, so the bottom can scroll above it', async () => {
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <KeyboardAwareScrollView>
          <Text>Review</Text>
        </KeyboardAwareScrollView>
      </SafeAreaProvider>,
    );
    expect(screen.queryByTestId('keyboard-space')).toBeNull();

    await act(async () => {
      DeviceEventEmitter.emit('keyboardDidShow', { endCoordinates: { screenX: 0, screenY: 544, width: 390, height: 300 } });
    });
    expect(screen.getByTestId('keyboard-space')).toHaveStyle({ height: 324 });

    await act(async () => {
      DeviceEventEmitter.emit('keyboardDidHide', { endCoordinates: { screenX: 0, screenY: 844, width: 390, height: 0 } });
    });
    expect(screen.queryByTestId('keyboard-space')).toBeNull();
  });
});
