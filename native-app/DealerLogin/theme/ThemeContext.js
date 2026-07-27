import React, { createContext, useContext } from 'react';

const lightTheme = {
  background: '#f6f7fa',
  card: '#ffffff',
  text: '#000000',
  placeholder: '#888888',
};

const darkTheme = {
  background: '#000000',
  card: '#1a1a1a',
  text: '#ffffff',
  placeholder: '#aaaaaa',
};

const ThemeContext = createContext(lightTheme);

export const ThemeProvider = ({ children, scheme }) => {
  const theme = scheme === 'dark' ? darkTheme : lightTheme;
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
