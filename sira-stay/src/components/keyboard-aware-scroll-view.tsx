import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Keyboard, LayoutAnimation, Platform, ScrollView, View, type KeyboardEvent, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';

/*
 * The app draws edge-to-edge, so on Android the keyboard covers the screen instead of resizing it, and
 * React Native's KeyboardAvoidingView (left off on Android here) can't be relied on. Two pieces fix that,
 * both measuring in window coordinates so headers need no offsets:
 * - KeyboardAvoidingContainer lifts what's pinned at its bottom (a footer button, a chat composer).
 * - KeyboardAwareScrollView scrolls the focused text box — every TextField registers itself, and
 *   useKeepAboveKeyboard can widen that to a block such as a comment box with its Submit button.
 */

/** Gap kept between a revealed block and the keyboard (and the top of the scroll view). */
const MARGIN = 12;

/** How much of a view the keyboard covers: from the keyboard's top edge down to the view's bottom edge. */
export const keyboardOverlap = (viewBottom: number, keyboardTop: number) => Math.max(0, Math.round(viewBottom - keyboardTop));

/**
 * How far to scroll down so a block sits inside the visible part of a scroll view (all values in window
 * coordinates). When the block is taller than that space, its top stays in view instead, so a text box
 * never goes off-screen.
 */
export function scrollToReveal({
  blockTop,
  blockBottom,
  visibleTop,
  visibleBottom,
}: {
  blockTop: number;
  blockBottom: number;
  visibleTop: number;
  visibleBottom: number;
}) {
  const covered = blockBottom + MARGIN - visibleBottom;
  const roomAbove = blockTop - MARGIN - visibleTop;
  return Math.max(0, Math.min(covered, roomAbove));
}

// iOS announces the keyboard before it moves, so the layout can animate along; Android only afterwards.
const WILL_SHOW = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
const WILL_HIDE = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

function moveWithKeyboard(e: KeyboardEvent) {
  if (Platform.OS === 'ios' && e.duration) {
    LayoutAnimation.configureNext({ duration: e.duration, update: { duration: e.duration, type: LayoutAnimation.Types.keyboard } });
  }
}

/**
 * Keeps the bottom of its content — a footer button, a chat composer — above the keyboard by padding its
 * bottom by however much the keyboard covers it.
 */
export function KeyboardAvoidingContainer({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const ref = useRef<View>(null);
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const shown = Keyboard.addListener(WILL_SHOW, (e) => {
      ref.current?.measureInWindow((_x, y, _w, height) => {
        moveWithKeyboard(e);
        setInset(keyboardOverlap(y + height, e.endCoordinates.screenY));
      });
    });
    const hidden = Keyboard.addListener(WILL_HIDE, (e) => {
      moveWithKeyboard(e);
      setInset(0);
    });
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  return (
    <View ref={ref} style={[style, inset > 0 && { paddingBottom: inset }]}>
      {children}
    </View>
  );
}

type Block = RefObject<View | null>;
type Blocks = { focus: (block: Block) => void; blur: (block: Block) => void };
const BlocksContext = createContext<Blocks | null>(null);

/**
 * ScrollView whose text boxes stay usable above the keyboard: it adds room below the content for however
 * much the keyboard covers it (none inside a KeyboardAvoidingContainer that already lifted it), and
 * scrolls the focused block into view — again whenever the layout changes, e.g. a box grows or a warning
 * appears.
 */
export function KeyboardAwareScrollView({ children, onScroll, onContentSizeChange, onLayout, ...props }: ScrollViewProps) {
  const scrollRef = useRef<ScrollView>(null);
  const offset = useRef(0);
  const active = useRef<Block | null>(null);
  const [space, setSpace] = useState(0);

  const update = useCallback(() => {
    const keyboard = Keyboard.metrics();
    const scroll = scrollRef.current;
    if (!keyboard || !scroll) {
      setSpace(0);
      return;
    }
    scroll.getNativeScrollRef()?.measureInWindow((_sx, top, _sw, height) => {
      setSpace(keyboardOverlap(top + height, keyboard.screenY));
      active.current?.current?.measureInWindow((_x, blockTop, _w, blockHeight) => {
        const by = scrollToReveal({
          blockTop,
          blockBottom: blockTop + blockHeight,
          visibleTop: top,
          visibleBottom: Math.min(keyboard.screenY, top + height),
        });
        if (by > 0) scroll.scrollTo({ y: offset.current + by, animated: true });
      });
    });
  }, []);

  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', update);
    const hidden = Keyboard.addListener('keyboardDidHide', update);
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [update]);

  const blocks = useMemo<Blocks>(
    () => ({
      focus: (block) => {
        active.current = block;
        update();
      },
      // Focus can move to the next box before the previous one reports its blur.
      blur: (block) => {
        if (active.current === block) active.current = null;
      },
    }),
    [update],
  );

  return (
    <BlocksContext.Provider value={blocks}>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        {...props}
        onScroll={(e) => {
          offset.current = e.nativeEvent.contentOffset.y;
          onScroll?.(e);
        }}
        onLayout={(e) => {
          update();
          onLayout?.(e);
        }}
        onContentSizeChange={(width, height) => {
          update();
          onContentSizeChange?.(width, height);
        }}>
        {children}
        {space > 0 && <View testID="keyboard-space" style={{ height: space }} />}
      </ScrollView>
    </BlocksContext.Provider>
  );
}

/**
 * Keeps a block above the keyboard while its text box is focused, inside a KeyboardAwareScrollView (does
 * nothing elsewhere). Put `blockRef` on the block's View and `onFocus`/`onBlur` on the text box. TextField
 * does this for itself; use it directly to keep more in view, like a comment box and its Submit button.
 */
export function useKeepAboveKeyboard() {
  const blocks = useContext(BlocksContext);
  const blockRef = useRef<View>(null);
  const onFocus = useCallback(() => blocks?.focus(blockRef), [blocks]);
  const onBlur = useCallback(() => blocks?.blur(blockRef), [blocks]);
  return { blockRef, onFocus, onBlur };
}
