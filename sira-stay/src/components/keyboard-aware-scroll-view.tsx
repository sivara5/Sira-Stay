import { createContext, useCallback, useContext, useEffect, useRef, useState, type RefObject } from 'react';
import { Keyboard, ScrollView, View, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Gap kept between a revealed block and the keyboard (and the top of the scroll view). */
const MARGIN = 12;

/**
 * How far to scroll down so a block sits above the keyboard (all values in window coordinates). When the
 * block is taller than the space left, its top stays in view instead, so a text box never goes off-screen.
 */
export function scrollToReveal({
  blockTop,
  blockBottom,
  visibleTop,
  keyboardTop,
}: {
  blockTop: number;
  blockBottom: number;
  visibleTop: number;
  keyboardTop: number;
}) {
  const covered = blockBottom + MARGIN - keyboardTop;
  const roomAbove = blockTop - MARGIN - visibleTop;
  return Math.max(0, Math.min(covered, roomAbove));
}

type Block = RefObject<View | null>;
const RevealContext = createContext<((block: Block | null) => void) | null>(null);

/**
 * ScrollView whose text boxes stay usable above the keyboard. The app draws edge-to-edge, so on Android
 * the keyboard covers the screen instead of resizing it: while the keyboard is up this adds room below
 * the content, and scrolls the focused block (see useKeepAboveKeyboard) into view — again whenever the
 * content changes size, e.g. the text box grows or a warning appears.
 */
export function KeyboardAwareScrollView({ children, onScroll, onContentSizeChange, ...props }: ScrollViewProps) {
  const scrollRef = useRef<ScrollView>(null);
  const offset = useRef(0);
  const active = useRef<Block | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  const reveal = useCallback(() => {
    const block = active.current?.current;
    const keyboard = Keyboard.metrics();
    const scroll = scrollRef.current;
    if (!block || !keyboard || !scroll) return;
    scroll.getNativeScrollRef()?.measureInWindow((_sx, visibleTop) => {
      block.measureInWindow((_x, blockTop, _w, height) => {
        const by = scrollToReveal({ blockTop, blockBottom: blockTop + height, visibleTop, keyboardTop: keyboard.screenY });
        if (by > 0) scroll.scrollTo({ y: offset.current + by, animated: true });
      });
    });
  }, []);

  const setActive = useCallback(
    (block: Block | null) => {
      active.current = block;
      reveal(); // no-op until the keyboard is up; then the keyboard's own events take over
    },
    [reveal],
  );

  return (
    <RevealContext.Provider value={setActive}>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        {...props}
        onScroll={(e) => {
          offset.current = e.nativeEvent.contentOffset.y;
          onScroll?.(e);
        }}
        onContentSizeChange={(width, height) => {
          reveal();
          onContentSizeChange?.(width, height);
        }}>
        {children}
        {keyboardHeight > 0 && <View testID="keyboard-space" style={{ height: keyboardHeight + insets.bottom }} />}
      </ScrollView>
    </RevealContext.Provider>
  );
}

/**
 * Keeps a block — a text box plus what belongs with it, like its warnings and Submit button — above the
 * keyboard while the text box is focused. Put `blockRef` on the block's View and `onFocus`/`onBlur` on the
 * text box. Does nothing outside a KeyboardAwareScrollView.
 */
export function useKeepAboveKeyboard() {
  const setActive = useContext(RevealContext);
  const blockRef = useRef<View>(null);
  const onFocus = useCallback(() => setActive?.(blockRef), [setActive]);
  const onBlur = useCallback(() => setActive?.(null), [setActive]);
  return { blockRef, onFocus, onBlur };
}
