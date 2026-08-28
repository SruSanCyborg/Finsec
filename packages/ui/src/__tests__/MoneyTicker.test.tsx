import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MoneyTicker } from '../sirius/MoneyTicker';


describe('MoneyTicker Component', () => {
  it('renders tabular money ticker container', () => {
    const { container } = render(<MoneyTicker amountUSD={1450000} currencySymbol="$" variant="large" />);
    expect(container.querySelector('.sirius-numeral-tabular')).toBeTruthy();
  });
});
