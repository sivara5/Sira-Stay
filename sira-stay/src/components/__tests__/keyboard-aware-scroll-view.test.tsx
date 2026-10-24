import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { DeviceEventEmitter, ScrollView, Text, View } from 'react-native';

import {
  KeyboardAvoidingContainer,
  KeyboardAwareScrollView,
  keyboardOverlap,
  scrollToReveal,
  useKeepAboveKeyboard,
} from '@/components/keyboard-aware-scroll-view';
import { TextField } from '@/components/text-field';

// React Native's Jest mocks share these native methods across every View / ScrollView, so the tests decide
// where things are on screen (window coordinates: x, y, width, height).
const measureView = View.prototype.measureInWindow as unknown as jest.Mock;
const scrollView = ScrollView.prototype as unknown as { getNativeScrollRef: jest.Mock; scrollTo: jest.Mock };
type Frame = [number, number, number, number];
const placeScrollView = (frame: Frame) =>
  scrollView.getNativeScrollRef.mockReturnValue({ measureInWindow: (done: (...f: Frame) => void) => done(...frame) });
const placeViews = (frames: Record<string, Frame>, otherwise: Frame) =>
  measureView.mockImplementation(function (this: { props: { testID?: string } }, done: (...f: Frame) => void) {
    done(...(frames[this.props.testID ?? ''] ?? otherwise));
  });

// A phone 844 pt tall whose keyboard covers everything below y = 500.
const keyboard = { screenX: 0, screenY: 500, width: 390, height: 344 };
const showKeyboard = (event: string) => act(async () => DeviceEventEmitter.emit(event, { duration: 0, endCoordinates: keyboard }));
const hideKeyboard = (event: string) =>
  act(async () => DeviceEventEmitter.emit(event, { duration: 0, endCoordinates: { ...keyboard, screenY: 844, height: 0 } }));

afterEach(async () => {
  await hideKeyboard('keyboardDidHide');
  measureView.mockReset();
  scrollView.getNativeScrollRef.mockReset();
  scrollView.scrollTo.mockClear();
});

describe('keyboard maths', () => {
  it('measures how much of a view the keyboard covers', () => {
    expect(keyboardOverlap(800, 500)).toBe(300);
    expect(keyboardOverlap(450, 500)).toBe(0);
  });

  it('scrolls a covered block up into the visible space, with a gap', () => {
    expect(scrollToReveal({ blockTop: 550, blockBottom: 720, visibleTop: 100, visibleBottom: 500 })).toBe(232);
  });

  it('leaves a block that is already visible alone', () => {
    expect(scrollToReveal({ blockTop: 200, blockBottom: 400, visibleTop: 100, visibleBottom: 500 })).toBe(0);
  });

  it('keeps the top of a block in view when the whole block cannot fit', () => {
    expect(scrollToReveal({ blockTop: 450, blockBottom: 1000, visibleTop: 100, visibleBottom: 500 })).toBe(338);
  });
});

describe('KeyboardAvoidingContainer', () => {
  it('lifts what is pinned at its bottom (a footer, the chat message box) above the keyboard', async () => {
    placeViews({}, [0, 0, 390, 800]); // the container ends at y = 800, behind the keyboard
    await render(
      <KeyboardAvoidingContainer>
        <Text>Message box</Text>
      </KeyboardAvoidingContainer>,
    );
    const container = screen.getByText('Message box').parent!;

    await showKeyboard('keyboardWillShow');
    expect(container).toHaveStyle({ paddingBottom: 300 });

    await hideKeyboard('keyboardWillHide');
    expect(container).not.toHaveStyle({ paddingBottom: 300 });
  });
});

describe('KeyboardAwareScrollView', () => {
  it('adds room below the content for the part the keyboard covers', async () => {
    placeScrollView([0, 100, 390, 700]); // ends at y = 800
    await render(
      <KeyboardAwareScrollView>
        <Text>Review</Text>
      </KeyboardAwareScrollView>,
    );
    expect(screen.queryByTestId('keyboard-space')).toBeNull();

    await showKeyboard('keyboardDidShow');
    expect(screen.getByTestId('keyboard-space')).toHaveStyle({ height: 300 });

    await hideKeyboard('keyboardDidHide');
    expect(screen.queryByTestId('keyboard-space')).toBeNull();
  });

  it('adds nothing when a container around it already lifted it above the keyboard', async () => {
    placeScrollView([0, 100, 390, 400]); // ends at y = 500, right on the keyboard
    await render(
      <KeyboardAwareScrollView>
        <Text>Form</Text>
      </KeyboardAwareScrollView>,
    );
    await showKeyboard('keyboardDidShow');
    expect(screen.queryByTestId('keyboard-space')).toBeNull();
  });

  it('scrolls a focused text field up above the keyboard', async () => {
    placeScrollView([0, 100, 390, 700]);
    placeViews({}, [0, 600, 390, 80]); // the field, under the keyboard
    await render(
      <KeyboardAwareScrollView>
        <TextField label="Note" accessibilityLabel="Note" />
      </KeyboardAwareScrollView>,
    );
    await showKeyboard('keyboardDidShow');
    await fireEvent(screen.getByLabelText('Note'), 'focus');
    // Field bottom 680 + 12 gap − keyboard top 500.
    expect(scrollView.scrollTo).toHaveBeenLastCalledWith({ y: 192, animated: true });
  });

  it('keeps a whole block in view — a comment box with its Submit button — not just the box', async () => {
    placeScrollView([0, 100, 390, 700]);
    placeViews({ compose: [0, 550, 390, 250] }, [0, 550, 390, 80]);
    function Compose() {
      const { blockRef, onFocus, onBlur } = useKeepAboveKeyboard();
      return (
        <View ref={blockRef} testID="compose">
          <TextField label="Comment" accessibilityLabel="Comment" onFocus={onFocus} onBlur={onBlur} />
          <Text>Submit</Text>
        </View>
      );
    }
    await render(
      <KeyboardAwareScrollView>
        <Compose />
      </KeyboardAwareScrollView>,
    );
    await showKeyboard('keyboardDidShow');
    await fireEvent(screen.getByLabelText('Comment'), 'focus');
    // Block bottom 800 + 12 gap − keyboard top 500 (the box alone would only need 142).
    expect(scrollView.scrollTo).toHaveBeenLastCalledWith({ y: 312, animated: true });
  });
});
