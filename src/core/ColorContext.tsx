import { createContext, useContext } from 'react';

type ColorContextType = {
  color: string;
  setColor: (color: string) => void;
};

export const ColorContext = createContext<ColorContextType>({
  color: '#00A6FF',
  setColor: () => {},
});

export const useColor = () => {
  const context = useContext(ColorContext);
  if (!context) {
    throw new Error('useColor must be used within a ColorProvider');
  }
  return context;
};
