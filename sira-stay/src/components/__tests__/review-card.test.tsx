import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ReviewCard } from '@/components/review-card';
import { api } from '@/lib/api';
import { I18nProvider } from '@/lib/i18n';

jest.mock('@/lib/api', () => ({ ...jest.requireActual('@/lib/api'), api: jest.fn() }));

const saveReview = api as jest.Mock;
const PATH = '/properties/p1/reviews';

async function writeReview(comment: string) {
  await render(
    <I18nProvider>
      <ReviewCard myReview={null} path={PATH} onSaved={jest.fn()} />
    </I18nProvider>,
  );
  await fireEvent.press(screen.getByLabelText('5'));
  await fireEvent.changeText(screen.getByLabelText('Comment (optional)'), comment);
  return screen.getByRole('button', { name: /Submit rating/ });
}

beforeEach(() => saveReview.mockReset());

describe('ReviewCard', () => {
  it("warns about the owner's phone number and won't save", async () => {
    const submit = await writeReview('Great owner, call him on 98765 43210');
    expect(screen.getByText('Remove the phone number "98765 43210".')).toBeOnTheScreen();
    expect(screen.getByText(/Reviews are public/)).toBeOnTheScreen();
    expect(submit).toBeDisabled();
    await fireEvent.press(submit);
    expect(saveReview).not.toHaveBeenCalled();
  });

  it("warns about the house's address and pincode", async () => {
    await writeReview('Lovely house at 14, 80 Feet Road');
    expect(screen.getByText(/Remove the street address "14, 80 Feet Road"/)).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('Comment (optional)'), 'Near Bengaluru 560038');
    expect(screen.getByText('Remove the pincode "560038".')).toBeOnTheScreen();
  });

  it('saves once the detail is removed', async () => {
    saveReview.mockResolvedValue({ property: {} });
    await writeReview('Call 98765 43210');
    await fireEvent.changeText(screen.getByLabelText('Comment (optional)'), 'Owner was helpful. Rent was 12000, worth it.');
    const submit = screen.getByRole('button', { name: /Submit rating/ });
    expect(submit).toBeEnabled();
    expect(screen.queryByText(/Reviews are public/)).not.toBeOnTheScreen();

    await fireEvent.press(submit);
    await waitFor(() =>
      expect(saveReview).toHaveBeenCalledWith(PATH, { body: { rating: 5, comment: 'Owner was helpful. Rent was 12000, worth it.' } }),
    );
  });
});
