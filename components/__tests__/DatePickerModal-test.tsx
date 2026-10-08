import React from 'react';
import { afterEach, expect, it, jest } from '@jest/globals';
import renderer from 'react-test-renderer';
import { Platform } from 'react-native';
import { DatePickerModal } from '../DatePickerModal';

jest.mock('../motion/Motion', () => ({ MotionPressable: jest.requireActual<Record<string, unknown>>('react-native').Pressable, useMotionPreference: () => false }));
jest.mock('../journal/theme', () => ({ useJournalColors: () => ({ surface: '#fff', ink: '#222' }) }));
jest.mock('../ThemedText', () => ({ ThemedText: jest.requireActual<Record<string, unknown>>('react-native').Text }));
jest.mock('@react-native-community/datetimepicker', () => 'DatePicker');
const originalOS = Platform.OS;
afterEach(() => { Object.defineProperty(Platform, 'OS', { value: originalOS }); });
const original = new Date('2026-10-08T12:00:00');
const changed = new Date('2026-10-06T12:00:00');
const event = (type: string) => ({ type, nativeEvent: { timestamp: changed.getTime(), utcOffset: 0 } });
const picker = (tree: renderer.ReactTestRenderer) => tree.root.findAll(node => node.type === ('DatePicker' as never))[0];
const button = (tree: renderer.ReactTestRenderer, label: string) => tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function').at(-1)!;
function mount(os: 'ios' | 'android' = 'ios') {
  Object.defineProperty(Platform, 'OS', { value: os });
  const onDateChange = jest.fn(); const onClose = jest.fn();
  const props = { isVisible: true, selectedDate: original, onDateChange, onClose };
  let tree!: renderer.ReactTestRenderer;
  renderer.act(() => { tree = renderer.create(<DatePickerModal {...props} />); });
  return { tree, props, onDateChange, onClose };
}
it('previews an iOS date without changing the saved date, and Cancel discards it', () => {
  const { tree, onDateChange, onClose } = mount();
  renderer.act(() => picker(tree).props.onChange(event('set'), changed));
  expect(picker(tree).props.value).toEqual(changed); expect(onDateChange).not.toHaveBeenCalled();
  renderer.act(() => button(tree, 'Cancel').props.onPress());
  expect(onClose).toHaveBeenCalledTimes(1); expect(onDateChange).not.toHaveBeenCalled();
  renderer.act(() => tree.unmount());
});
it('Done commits the preview once and reopening restores the saved date', () => {
  const { tree, props, onDateChange, onClose } = mount();
  renderer.act(() => picker(tree).props.onChange(event('set'), changed));
  renderer.act(() => button(tree, 'Done').props.onPress());
  expect(onDateChange).toHaveBeenCalledTimes(1); expect(onDateChange).toHaveBeenCalledWith(changed); expect(onClose).toHaveBeenCalledTimes(1);
  renderer.act(() => tree.update(<DatePickerModal {...props} isVisible={false} />));
  renderer.act(() => tree.update(<DatePickerModal {...props} />));
  expect(picker(tree).props.value).toEqual(original);
  renderer.act(() => tree.unmount());
});
it('Android dismissal never commits the picker date', () => {
  const { tree, onDateChange, onClose } = mount('android');
  renderer.act(() => picker(tree).props.onChange(event('dismissed'), changed));
  expect(onDateChange).not.toHaveBeenCalled(); expect(onClose).toHaveBeenCalledTimes(1);
  renderer.act(() => tree.unmount());
});
it('Android confirmation commits the selected date', () => {
  const { tree, onDateChange, onClose } = mount('android');
  renderer.act(() => picker(tree).props.onChange(event('set'), changed));
  expect(onDateChange).toHaveBeenCalledWith(changed); expect(onClose).toHaveBeenCalledTimes(1);
  renderer.act(() => tree.unmount());
});
