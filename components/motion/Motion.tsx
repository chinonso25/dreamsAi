import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, AppState, Pressable, type PressableProps, type ViewProps } from 'react-native';
import Animated, { cubicBezier, Easing, FadeIn, FadeInDown, FadeOut, ReduceMotion, useReducedMotion, type CSSAnimationKeyframes } from 'react-native-reanimated';
import { useIsFocused } from 'expo-router/react-navigation';
import { haptic, type HapticKind } from '@/util/haptics';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const CSS_EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);
const MotionContext = createContext(false);
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
export function MotionProvider({ children }: { children: ReactNode }) {
  const initial = useReducedMotion();
  const [reduced, setReduced] = useState(initial);
  useEffect(() => {
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => subscription.remove();
  }, []);
  return <MotionContext.Provider value={reduced}>{children}</MotionContext.Provider>;
}
export const useMotionPreference = () => useContext(MotionContext);

/** A single press animation and one haptic at commit; callbacks and accessibility stay native. */
export function MotionPressable({ style, onPress, onPressIn, onPressOut, children, haptic: feedback = 'light', pressScale = .97, ...props }: PressableProps & { haptic?: HapticKind; pressScale?: number }) {
  const [pressed, setPressed] = useState(false);
  const reduced = useMotionPreference();
  return <AnimatedPressable {...props} pressRetentionOffset={props.pressRetentionOffset ?? 16}
    onPressIn={event => { setPressed(Boolean(onPress) && !props.disabled); onPressIn?.(event); }} onPressOut={event => { setPressed(false); onPressOut?.(event); }}
    onPress={event => { if (props.disabled || !onPress) return; haptic(feedback); return onPress(event); }}
    style={[typeof style === 'function' ? style({ pressed, hovered: false }) : style, { transform: [{ scale: reduced || !pressed || props.disabled ? 1 : pressScale }], transitionProperty: ['transform', 'opacity', 'backgroundColor', 'borderColor'], transitionDuration: reduced ? 0 : 120, transitionTimingFunction: CSS_EASE_OUT }]}>
    {typeof children === 'function' ? children({ pressed, hovered: false }) : children}
  </AnimatedPressable>;
}
/** Reveal containers, never recycled list rows. */
export function MotionReveal({ children, delay = 0, subtle = false, style, ...props }: ViewProps & { delay?: number; subtle?: boolean }) {
  const reduced = useMotionPreference();
  const entering = (reduced || subtle ? FadeIn.duration(150) : FadeInDown.duration(250).easing(EASE_OUT).delay(Math.min(delay, 160))).reduceMotion(ReduceMotion.System);
  return <Animated.View {...props} entering={entering} exiting={FadeOut.duration(120).reduceMotion(ReduceMotion.System)} style={style}>{children}</Animated.View>;
}
export function MotionSelection({ selected, children, style }: ViewProps & { selected: boolean }) {
  const reduced = useMotionPreference();
  return <Animated.View style={[style, { transform: [{ scale: reduced ? 1 : selected ? 1.06 : 1 }], transitionProperty: ['transform', 'backgroundColor', 'opacity'], transitionDuration: reduced ? 0 : 150, transitionTimingFunction: CSS_EASE_OUT }]}>{children}</Animated.View>;
}
const FLOAT: CSSAnimationKeyframes = { '0%': { transform: [{ translateY: 0 }, { rotate: '-2deg' }] }, '50%': { transform: [{ translateY: -6 }, { rotate: '2deg' }] }, '100%': { transform: [{ translateY: 0 }, { rotate: '-2deg' }] } };
const PULSE: CSSAnimationKeyframes = { from: { opacity: .4, transform: [{ scale: .9 }] }, to: { opacity: 0, transform: [{ scale: 1.3 }] } };
/** Decorative loops stop off screen, in the background, and for Reduce Motion. */
export function MotionAmbient({ children, style, kind = 'float', active = true, ...props }: ViewProps & { kind?: 'float' | 'pulse'; active?: boolean }) {
  const reduced = useMotionPreference();
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => { const subscription = AppState.addEventListener('change', state => setForeground(state === 'active')); return () => subscription.remove(); }, []);
  const running = !reduced && focused && foreground && active;
  return <Animated.View {...props} pointerEvents="none" style={[style, { animationName: running ? kind === 'float' ? FLOAT : PULSE : 'none', animationDuration: kind === 'float' ? 4400 : 1400, animationIterationCount: 'infinite', animationTimingFunction: kind === 'float' ? 'ease-in-out' : 'linear' }]}>{children}</Animated.View>;
}

/** Progress uses a transform so playback updates do not relayout the screen. */
export function MotionProgress({ value, style }: { value: number; style?: ViewProps['style'] }) {
  const reduced = useMotionPreference();
  return <Animated.View style={[style, { width: '100%', transformOrigin: 'left', transform: [{ scaleX: Math.max(0, Math.min(1, value)) }], transitionProperty: 'transform', transitionDuration: reduced ? 0 : 180, transitionTimingFunction: 'linear' }]} />;
}
