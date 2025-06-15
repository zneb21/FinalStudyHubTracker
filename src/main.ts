import React from 'react'; // Still need React import for React.createElement and React.StrictMode
import ReactDOM from 'react-dom/client';
import App from './App.tsx'; // Import your App.tsx component (which still uses JSX)
import './style.css'; // Importing style.css

// This renders your React App component into the HTML element with id 'root'
// Using React.createElement to avoid JSX syntax in this file
ReactDOM.createRoot(document.getElementById('root')!).render(
  React.createElement(React.StrictMode, null,
    React.createElement(App, null)
  )
);