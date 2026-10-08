import * as React from 'react';
import renderer from 'react-test-renderer';
import { expect, it } from '@jest/globals';

import { ThemedText } from '../ThemedText';

it(`renders correctly`, async () => {
  let tree: renderer.ReactTestRenderer;
  await renderer.act(async () => {
    tree = renderer.create(<ThemedText>Snapshot test!</ThemedText>);
  });

  expect(tree!.toJSON()).toMatchSnapshot();
});
