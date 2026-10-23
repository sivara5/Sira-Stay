import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from '@/components/button';

describe('Button', () => {
  it('ignores presses while disabled or loading', async () => {
    const onPress = jest.fn();
    await render(<Button title="Save" onPress={onPress} disabled />);
    await fireEvent.press(screen.getByRole('button'));
    await screen.rerender(<Button title="Save" onPress={onPress} loading />);
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('presses when enabled', async () => {
    const onPress = jest.fn();
    await render(<Button title="Save" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: /Save/ }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
