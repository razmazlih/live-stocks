export interface GroupFormState {
  id: string | null;
  name: string;
  description: string;
}

export interface TickerFormState {
  id: string | null;
  symbol: string;
  display: string;
  imageUrl: string;
  note: string;
}

export function createEmptyGroupForm(): GroupFormState {
  return { id: null, name: '', description: '' };
}

export function createEmptyTickerForm(): TickerFormState {
  return { id: null, symbol: '', display: '', imageUrl: '', note: '' };
}
