import { MessageItem } from '@/types/misc';
import { createContext, Dispatch, SetStateAction, useContext } from 'react';

type SelectedItemsContextType = {
  images: MessageItem[];
  setImages: Dispatch<SetStateAction<MessageItem[]>>;
};

export const SelectedItemsContext = createContext<SelectedItemsContextType>({
  images: [],
  setImages: () => {},
});

export const useSelectedItems = () => {
  const context = useContext(SelectedItemsContext);
  if (!context) {
    throw new Error(
      'useSelectedItems must be used within a SelectedItemsProvider',
    );
  }
  return context;
};
