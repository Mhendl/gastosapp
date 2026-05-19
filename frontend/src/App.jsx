import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Gastos from './pages/Gastos';
import Chat from './pages/Chat';
import Admin from './pages/Admin';
import Layout from './components/Layout';

function PrivateRoute({ children }) {
  return localStorage.getItem('token') ? children : <Navigate to="/login" />;
}

function AdminRoute({ children }) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  return localStorage.getItem('token') && user.rol === 'admin' ? children : <Navigate to="/" />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="gastos" element={<Gastos />} />
          <Route path="chat" element={<Chat />} />
          <Route path="admin" element={<AdminRoute><Admin /></AdminRoute>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
