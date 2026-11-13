import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import { ToastProvider } from './components/Toast';
import '@xyflow/react/dist/style.css';
import './styles.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('找不到 #root 挂载点，检查 index.html');
}

createRoot(container).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
